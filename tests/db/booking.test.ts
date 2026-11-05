import { after, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { admin, appPool, makeHug, resetData, restoreDefaults, sqlState } from "./helpers.ts";

const a = admin();
const app = appPool(30);
beforeEach(() => resetData(a));
after(async () => {
  await restoreDefaults(a);
  await a.end();
  await app.end();
});

const book = (hug: string) => app.query("select * from app.book_video($1, '')", [hug]);
const active = async () =>
  (await a.query(`select recording_day::text as day, count(*)::int as n from app.video_orders
                   where status <> 'canceled' group by 1 order by 1`)).rows as { day: string; n: number }[];

describe("capacity under concurrency", () => {
  test("30 simultaneous bookings for a 5-slot day: exactly 5 succeed", async () => {
    await a.query("update app.settings set booking_horizon_days = 1");
    const hugs = await makeHug(a, 30);
    const results = await Promise.all(hugs.map((h) => sqlState(book(h))));
    assert.equal(results.filter((r) => r === "ok").length, 5);
    assert.equal(results.filter((r) => r === "WH002").length, 25);
    const days = await active();
    assert.equal(days.length, 1);
    assert.equal(days[0].n, 5);
  });

  test("overflow rolls to the next available day, never above capacity", async () => {
    await a.query("update app.settings set booking_horizon_days = 3");
    const hugs = await makeHug(a, 18);
    const results = await Promise.all(hugs.map((h) => sqlState(book(h))));
    assert.equal(results.filter((r) => r === "ok").length, 15);
    assert.deepEqual(
      (await active()).map((d) => d.n),
      [5, 5, 5],
    );
  });

  test("a double-tap can never create two orders for one hug", async () => {
    const [hug] = await makeHug(a);
    const results = await Promise.all(Array.from({ length: 12 }, () => sqlState(book(hug))));
    assert.equal(results.filter((r) => r === "ok").length, 1);
    assert.ok(results.filter((r) => r !== "ok").every((r) => r === "WH001"));
  });

  test("per-day capacity and closed days are honoured", async () => {
    await a.query("update app.settings set booking_horizon_days = 3");
    const today = (await a.query("select app.first_bookable_day()::text as d")).rows[0].d;
    await a.query("insert into app.recording_days (day, capacity, closed) values ($1::date, 5, true), ($1::date + 1, 2, false)", [today]);
    const hugs = await makeHug(a, 4);
    for (const h of hugs) await book(h);
    const days = await active();
    assert.equal(days[0].n, 2); // day 2 capped at 2
    assert.equal(days[1].n, 2); // rest roll to day 3
    assert.ok(!days.some((d) => d.day === today), "booked into a closed day");
  });

  test("paused studio takes no bookings and shows no availability", async () => {
    await a.query("update app.settings set paused = true");
    const [hug] = await makeHug(a);
    assert.equal(await sqlState(book(hug)), "WH003");
    assert.equal((await app.query("select * from app.next_available_day()")).rowCount, 0);
  });

  test("same-day cutoff moves the first bookable day to tomorrow", async () => {
    await a.query("update app.settings set same_day_cutoff_hour = 0");
    const { rows } = await a.query("select app.first_bookable_day() = app.studio_today() + 1 as ok");
    assert.ok(rows[0].ok);
  });
});

describe("no-charge waitlist", () => {
  test("joining is free, a freed slot is held for the oldest waiter, confirming books it", async () => {
    await a.query("update app.settings set booking_horizon_days = 1");
    const hugs = await makeHug(a, 7);
    for (const h of hugs.slice(0, 5)) await book(h);
    const [w1, w2] = hugs.slice(5);
    assert.equal(await sqlState(book(w1)), "WH002");
    await app.query("select app.join_waitlist($1, 'please')", [w1]);
    await app.query("select app.join_waitlist($1, '')", [w2]);
    assert.equal(await sqlState(app.query("select app.join_waitlist($1, '')", [w1])), "WH008");
    // Waiting costs nothing: no payment rows for waiters.
    assert.equal((await a.query("select * from app.payments where hug_id = any($1)", [[w1, w2]])).rowCount, 0);

    // A booked customer cancels → oldest waiter gets a held slot.
    const victim = (await a.query("select id from app.video_orders where hug_id = $1", [hugs[0]])).rows[0].id;
    await app.query("select app.cancel_video($1, 'customer', 'changed my mind')", [victim]);
    const held = (await a.query("select status, hold_expires_at from app.video_orders where hug_id = $1", [w1])).rows[0];
    assert.equal(held.status, "held");
    assert.ok(held.hold_expires_at > new Date());
    assert.equal((await a.query("select status from app.video_waitlist where hug_id = $1", [w2])).rows[0].status, "waiting");

    // The held slot counts toward capacity: nobody else can take it.
    const [stranger] = await makeHug(a);
    assert.equal(await sqlState(book(stranger)), "WH002");

    await app.query("select * from app.confirm_hold($1)", [w1]);
    assert.equal((await a.query("select status from app.video_orders where hug_id = $1", [w1])).rows[0].status, "booked");
    const pay = (await a.query("select status, amount_cents from app.payments where hug_id = $1", [w1])).rows[0];
    assert.deepEqual(pay, { status: "demo_authorized", amount_cents: 1500 });
    assert.equal((await a.query("select status from app.payments where video_order_id = $1", [victim])).rows[0].status, "demo_refunded");
  });

  test("an unconfirmed hold expires and passes to the next waiter", async () => {
    await a.query("update app.settings set booking_horizon_days = 1, default_daily_capacity = 1");
    const [b, w1, w2] = await makeHug(a, 3);
    await book(b);
    await app.query("select app.join_waitlist($1, '')", [w1]);
    await app.query("select app.join_waitlist($1, '')", [w2]);
    const o = (await a.query("select id from app.video_orders where hug_id = $1", [b])).rows[0].id;
    await app.query("select app.cancel_video($1, 'studio', 'sick day')", [o]);
    await a.query("update app.video_orders set hold_expires_at = now() - interval '1 minute' where hug_id = $1", [w1]);
    assert.equal((await app.query("select app.expire_holds() as n")).rows[0].n, 1);
    assert.equal(await sqlState(app.query("select * from app.confirm_hold($1)", [w1])), "WH006");
    assert.equal((await a.query("select status from app.video_waitlist where hug_id = $1", [w1])).rows[0].status, "expired");
    assert.equal((await a.query("select status from app.video_orders where hug_id = $1 and status <> 'canceled'", [w2])).rows[0].status, "held");
  });
});

describe("lifecycle rules", () => {
  test("customers can't cancel once recording starts; illegal transitions are refused", async () => {
    const [h] = await makeHug(a);
    await book(h);
    const id = (await a.query("select id from app.video_orders where hug_id = $1", [h])).rows[0].id;
    await app.query("select app.set_recording($1, true)", [id]);
    assert.equal(await sqlState(app.query("select app.cancel_video($1, 'customer', '')", [id])), "WH004");
    assert.equal(await sqlState(app.query("select app.set_recording($1, true)", [id])), "WH004");
    await app.query("select app.cancel_video($1, 'studio', 'camera broke')", [id]);
    assert.equal(await sqlState(app.query("select app.set_recording($1, true)", [id])), "WH004");
    // History is recorded for every step.
    const ev = (await a.query("select status::text from app.video_status_events where order_id = $1 order by id", [id])).rows.map((r) => r.status);
    assert.deepEqual(ev, ["booked", "recording", "canceled"]);
  });

  test("payments are demo-only and can't carry Stripe ids", async () => {
    const [h] = await makeHug(a);
    const st = await sqlState(
      app.query("insert into app.payments (sku, hug_id, provider, amount_cents, status, stripe_payment_intent_id) values ('hug_written', $1, 'demo', 100, 'demo_free', 'pi_123')", [h]),
    );
    assert.equal(st, "23514");
    const prices = (await a.query("select sku, amount_cents, available, deferred from app.products order by sku")).rows;
    assert.deepEqual(prices.find((p) => p.sku === "hug_video"), { sku: "hug_video", amount_cents: 1500, available: true, deferred: false });
    assert.ok(prices.filter((p) => p.sku !== "hug_written" && p.sku !== "hug_video").every((p) => p.deferred && !p.available));
  });
});
