import { after, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { admin, appPool, makeHug, resetData, restoreDefaults, sqlState, storage , BOOK_SQL, AUTHORIZE_SQL } from "./helpers.ts";

const a = admin();
const app = appPool(10);
beforeEach(() => resetData(a));
after(async () => {
  await restoreDefaults(a);
  await a.end();
  await app.end();
});

const book = (hug: string) => app.query(BOOK_SQL, [hug]);
const bookedDays = async () =>
  (await a.query(`select recording_day::text as day, extract(isodow from recording_day)::int as dow, count(*)::int as n
                    from app.video_orders where status <> 'canceled' group by 1, 2 order by 1`)).rows as { day: string; dow: number; n: number }[];

describe("beta studio rules", () => {
  test("migration defaults: Denver, 5 per day, 7-day window, 5 p.m. cutoff, Mon–Fri, 24 h holds, 30-day retention", async () => {
    await restoreDefaults(a);
    const s = (await a.query("select * from app.settings")).rows[0];
    assert.deepEqual(
      { tz: s.timezone, cap: s.default_daily_capacity, win: s.booking_horizon_days, cut: s.same_day_cutoff_hour, days: s.recording_weekdays, hold: s.waitlist_hold_hours, keep: s.video_retention_days },
      { tz: "America/Denver", cap: 5, win: 7, cut: 17, days: [1, 2, 3, 4, 5], hold: 24, keep: 30 },
    );
    const def = (await a.query(`select column_name, column_default from information_schema.columns where table_schema='app' and table_name='settings'`)).rows;
    assert.match(def.find((c) => c.column_name === "timezone").column_default, /America\/Denver/);
    assert.equal(def.find((c) => c.column_name === "booking_horizon_days").column_default, "7");
  });

  test("bookings never go past today + 6 days", async () => {
    await a.query("update app.settings set default_daily_capacity = 1");
    const hugs = await makeHug(a, 10);
    const res = [];
    for (const h of hugs) res.push(await sqlState(book(h)));
    assert.equal(res.filter((r) => r === "ok").length, 7);
    const last = (await a.query("select max(recording_day) - app.studio_today() as d from app.video_orders")).rows[0].d;
    assert.equal(last, 6);
  });

  test("only enabled recording days are booked", async () => {
    await a.query("update app.settings set recording_weekdays = '{1,2,3,4,5}'");
    const hugs = await makeHug(a, 40);
    for (const h of hugs) await sqlState(book(h));
    const days = await bookedDays();
    assert.ok(days.length >= 4 && days.length <= 5, `${days.length} days`);
    assert.ok(days.every((d) => d.dow >= 1 && d.dow <= 5), JSON.stringify(days));
    assert.ok(days.every((d) => d.n === 5));
  });

  test("the same-day cutoff is configurable and moves the first day", async () => {
    await a.query("update app.settings set same_day_cutoff_hour = 0");
    assert.ok((await a.query("select app.first_bookable_day() = app.studio_today() + 1 as ok")).rows[0].ok);
    await a.query("update app.settings set same_day_cutoff_hour = 24");
    assert.ok((await a.query("select app.first_bookable_day() = app.studio_today() as ok")).rows[0].ok);
    // The app role may change it (studio setting), within 0–24.
    assert.equal(await sqlState(app.query("update app.settings set same_day_cutoff_hour = 17")), "ok");
    assert.equal(await sqlState(app.query("update app.settings set same_day_cutoff_hour = 30")), "23514");
  });

  test("a hold never outlives 24 hours or the held day's cutoff", async () => {
    await a.query("update app.settings set default_daily_capacity = 1, booking_horizon_days = 1");
    const [b, w] = await makeHug(a, 2);
    await book(b);
    await app.query("select app.join_waitlist($1, '')", [w]);
    const o = (await a.query("select id from app.video_orders where hug_id = $1", [b])).rows[0].id;
    await app.query("select app.cancel_video($1, 'customer', '')", [o]);
    const r = (await a.query(
      `select hold_expires_at <= now() + interval '24 hours' as within24,
              hold_expires_at <= ((recording_day + interval '24 hours')::timestamp at time zone 'America/Denver') as before_cutoff
         from app.video_orders where hug_id = $1 and status = 'held'`,
      [w],
    )).rows[0];
    assert.deepEqual(r, { within24: true, before_cutoff: true });
    assert.equal(await sqlState(app.query("update app.settings set waitlist_hold_hours = 48")), "23514");
  });

  test("delivered videos are available for 30 days, then retired and deleted", async () => {
    const [h] = await makeHug(a);
    await book(h);
    const id = (await a.query("select id from app.video_orders where hug_id = $1", [h])).rows[0].id;
    await app.query(AUTHORIZE_SQL, [id]);
    await app.query("select app.set_recording($1, true)", [id]);
    const s = storage();
    const path = `${randomBytes(12).toString("base64url")}.mp4`;
    const { data } = await s.from("hug-videos").createSignedUploadUrl(path);
    await s.from("hug-videos").uploadToSignedUrl(path, data!.token, new Blob([new Uint8Array(20000)], { type: "video/mp4" }), { contentType: "video/mp4" });
    await app.query("select app.mark_video_ready($1, $2, 42.5)", [id, path]);
    const v = (await a.query("select video_expires_at - uploaded_at as keep, video_duration_seconds::float as dur from app.video_orders where id = $1", [id])).rows[0];
    assert.equal(v.keep.days, 30);
    assert.equal(v.dur, 42.5);
    assert.equal((await app.query("select * from app.expired_video_paths()")).rowCount, 0);
    await a.query("update app.video_orders set video_expires_at = now() - interval '1 minute' where id = $1", [id]);
    assert.equal((await app.query("select * from app.expired_video_paths()")).rowCount, 1);
    await app.query("select app.mark_video_expired($1)", [id]);
    const after = (await a.query("select status::text, video_path, video_deleted_at is not null as gone from app.video_orders where id = $1", [id])).rows[0];
    assert.deepEqual(after, { status: "expired", video_path: null, gone: true });
    await s.from("hug-videos").remove([path]);
  });
});
