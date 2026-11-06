// Payment rules, end to end through the running app with the FAKE gateway.
// Stripe test mode uses the same code paths; see docs/M3-REVIEW.md for what
// still needs a run against real Stripe test mode.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import Stripe from "stripe";
import { admin, resetData, restoreDefaults, storage } from "../db/helpers.ts";
import { founderCookie } from "../lib/founder.ts";
import { BASE, bookVideo, buyHug, confirmCheckout, fakeAction, fakePay, ip, owner, sessionFrom, settle, startHug } from "../lib/checkout.ts";

const a = admin();
before(() => resetData(a));
after(async () => {
  await restoreDefaults(a);
  await a.end();
});

const SECRET = process.env.STRIPE_WEBHOOK_SECRET || "whsec_local_fake_gateway_secret";
const sdk = new Stripe("sk_test_unused");
const signed = (evt: object, secret = SECRET) => {
  const payload = JSON.stringify(evt);
  return { payload, header: sdk.webhooks.generateTestHeaderString({ payload, secret }) };
};
const postWebhook = (payload: string, header: string | null) =>
  fetch(`${BASE}/api/stripe/webhook`, { method: "POST", headers: { "content-type": "application/json", ...(header ? { "stripe-signature": header } : {}) }, body: payload });
const studio = (cookie: string, path: string, init: RequestInit = {}) =>
  fetch(`${BASE}/api/studio${path}`, { ...init, redirect: "manual", headers: { cookie, "content-type": "application/json", ...(init.headers ?? {}) } });
const payRow = async (token: string) =>
  (await a.query("select p.* from app.payments p join app.video_orders o on o.id = p.video_order_id join app.hugs h on h.id = o.hug_id where h.token = $1", [token])).rows[0];
const orderId = async (token: string) =>
  (await a.query("select o.id from app.video_orders o join app.hugs h on h.id = o.hug_id where h.token = $1 and o.status <> 'canceled'", [token])).rows[0].id as string;

async function uploadAndFinalize(cookie: string, id: string) {
  const up = await (await studio(cookie, `/orders/${id}/upload-url`, { method: "POST", body: '{"mime":"video/mp4"}' })).json();
  const put = await fetch(up.url, { method: "PUT", headers: { "content-type": "video/mp4" }, body: new Uint8Array(40000) });
  assert.ok(put.ok);
  const fin = await studio(cookie, `/orders/${id}/finalize`, { method: "POST", body: JSON.stringify({ path: up.path, durationSeconds: 45 }) });
  return { status: fin.status, body: await fin.json(), path: up.path as string };
}
const videoStatus = (token: string) => fetch(`${BASE}/api/hugs/${token}/video/file`, { redirect: "manual" }).then((r) => r.status);

let cookie = "";
before(async () => {
  cookie = (await founderCookie(BASE, ip())).cookie;
});

describe("written hug: $1, paid before delivery", () => {
  test("no hug exists until payment is confirmed", async () => {
    const before = (await a.query("select count(*)::int n from app.hugs")).rows[0].n;
    const s = await startHug();
    assert.equal(s.status, 200);
    assert.ok(s.body.checkoutUrl && s.body.ownerKey && !s.body.token, "a token was issued before payment");
    assert.equal((await a.query("select count(*)::int n from app.hugs")).rows[0].n, before);
    const sid = sessionFrom(s.body.checkoutUrl);
    assert.equal((await confirmCheckout(sid)).state, "pending");

    // A declined card creates nothing.
    assert.equal((await fakePay(sid, "decline")).status, 402);
    assert.equal((await confirmCheckout(sid)).state, "pending");
    assert.equal((await a.query("select count(*)::int n from app.hugs")).rows[0].n, before);

    await fakePay(sid, "pay");
    const c = await confirmCheckout(sid);
    assert.equal(c.state, "paid");
    const p = (await a.query("select p.status::text, p.amount_cents from app.payments p join app.hugs h on h.id = p.hug_id where h.token = $1 and p.sku = 'hug_written'", [c.token])).rows[0];
    assert.deepEqual(p, { status: "captured", amount_cents: 100 });
    // The owner key from before checkout controls the new hug.
    assert.equal((await owner(c.token, s.body.ownerKey)).status, 200);
  });

  test("return page, webhook and retries converge on exactly one hug and one payment", async () => {
    const s = await startHug();
    const sid = sessionFrom(s.body.checkoutUrl);
    await fakePay(sid, "pay");
    const results = await Promise.all([confirmCheckout(sid), confirmCheckout(sid), confirmCheckout(sid)]);
    await settle(); // the fake gateway's webhooks have now been delivered too
    assert.equal(new Set(results.map((r) => r.token)).size, 1);
    const n = (await a.query("select count(*)::int n from app.payments where stripe_checkout_session_id = $1", [sid])).rows[0].n;
    assert.equal(n, 1);
  });

  test("an expired checkout closes the draft and deletes its photo", async () => {
    const s = await startHug({ photo: true });
    const d = (await a.query("select photo_path from app.hug_drafts where id = $1", [s.body.draftId])).rows[0];
    assert.ok(d.photo_path);
    await fakeAction({ action: "expire", sessionId: sessionFrom(s.body.checkoutUrl) });
    await settle();
    assert.equal((await a.query("select status from app.hug_drafts where id = $1", [s.body.draftId])).rows[0].status, "expired");
    const { data } = await storage().from("hug-photos").list("", { search: d.photo_path });
    assert.equal(data?.length ?? 0, 0);
  });
});

describe("webhooks", () => {
  test("unsigned, mis-signed and tampered events are rejected", async () => {
    const evt = { id: `evt_${randomBytes(6).toString("hex")}`, object: "event", type: "payment_intent.succeeded", data: { object: { id: "pi_x" } } };
    assert.equal((await postWebhook(JSON.stringify(evt), null)).status, 400);
    const wrong = signed(evt, "whsec_wrong_secret");
    assert.equal((await postWebhook(wrong.payload, wrong.header)).status, 400);
    const ok = signed(evt);
    assert.equal((await postWebhook(ok.payload.replace("pi_x", "pi_y"), ok.header)).status, 400);
    assert.equal((await a.query("select 1 from app.stripe_events where id = $1", [evt.id])).rowCount, 0);
  });

  test("a duplicate event is processed once", async () => {
    const evt = { id: `evt_${randomBytes(6).toString("hex")}`, object: "event", type: "customer.created", created: 1, livemode: false, data: { object: { id: "cus_x" } } };
    const s1 = signed(evt);
    const r1 = await (await postWebhook(s1.payload, s1.header)).json();
    const s2 = signed(evt);
    const r2 = await (await postWebhook(s2.payload, s2.header)).json();
    assert.deepEqual([r1.duplicate, r2.duplicate], [false, true]);
    assert.equal((await a.query("select count(*)::int n from app.stripe_events where id = $1", [evt.id])).rows[0].n, 1);
  });
});

describe("founder video: $15, charged only after a verified upload", () => {
  test("booking saves a card and charges nothing; recording requires authorization; capture happens after upload", async () => {
    const h = (await buyHug()).body;
    const b = await bookVideo(h, "pm_fake_ok", "AR-ee");
    assert.equal(b.body.state.video.status, "booked");
    let p = await payRow(h.token);
    assert.equal(p.status, "method_saved");
    assert.equal(p.stripe_payment_intent_id, null, "a payment intent existed before recording");
    assert.equal(p.amount_cents, 1500);

    const id = await orderId(h.token);
    assert.equal((await studio(cookie, `/orders/${id}`, { method: "PATCH", body: '{"status":"recording"}' })).status, 200);
    p = await payRow(h.token);
    assert.equal(p.status, "authorized");
    assert.ok(p.stripe_payment_intent_id);
    assert.equal(await videoStatus(h.token), 404);

    const fin = await uploadAndFinalize(cookie, id);
    assert.equal(fin.status, 200);
    assert.equal(fin.body.released, true);
    assert.equal((await payRow(h.token)).status, "captured");
    assert.equal(await videoStatus(h.token), 302);
    const dl = await fetch(`${BASE}/api/hugs/${h.token}/video/file?download`, { redirect: "manual" });
    assert.match(dl.headers.get("location") ?? "", /download=/);
  });

  test("a declined card blocks recording until the customer re-authorizes", async () => {
    const h = (await buyHug()).body;
    await bookVideo(h, "pm_fake_decline_later");
    const id = await orderId(h.token);
    const r = await studio(cookie, `/orders/${id}`, { method: "PATCH", body: '{"status":"recording"}' });
    assert.equal(r.status, 402);
    assert.match((await r.json()).error, /insufficient_funds/);
    assert.equal((await a.query("select status::text from app.video_orders where id = $1", [id])).rows[0].status, "booked");
    assert.equal((await payRow(h.token)).status, "action_required");
    // The customer fixes it on-session (authorize only — still no charge before upload).
    const fix = await (await owner(h.token, h.ownerKey, "/video", { method: "POST", body: '{"fixPayment":true}' })).json();
    const sid = sessionFrom(fix.checkoutUrl);
    await fakePay(sid, "pay");
    await owner(h.token, h.ownerKey, "/video", { method: "POST", body: JSON.stringify({ confirm: sid }) });
    assert.equal((await payRow(h.token)).status, "authorized");
    assert.equal((await studio(cookie, `/orders/${id}`, { method: "PATCH", body: '{"status":"recording"}' })).status, 200);
  });

  test("a bank asking for authentication (SCA/3-D Secure) is handled the same way", async () => {
    const h = (await buyHug()).body;
    await bookVideo(h, "pm_fake_auth_later");
    const id = await orderId(h.token);
    const r = await studio(cookie, `/orders/${id}`, { method: "PATCH", body: '{"status":"recording"}' });
    assert.equal(r.status, 402);
    assert.match((await r.json()).error, /authentication_required/);
  });

  test("a lapsed authorization is recovered with one fresh charge before release", async () => {
    const h = (await buyHug()).body;
    await bookVideo(h, "pm_fake_capture_fails");
    const id = await orderId(h.token);
    await studio(cookie, `/orders/${id}`, { method: "PATCH", body: '{"status":"recording"}' });
    const fin = await uploadAndFinalize(cookie, id);
    assert.equal(fin.body.released, true);
    const p = await payRow(h.token);
    assert.equal(p.status, "captured");
    assert.equal(await videoStatus(h.token), 302);
  });

  test("if payment ultimately fails, the recorded video is withheld until the customer pays", async () => {
    const h = (await buyHug()).body;
    await bookVideo(h, "pm_fake_ok");
    const id = await orderId(h.token);
    await studio(cookie, `/orders/${id}`, { method: "PATCH", body: '{"status":"recording"}' });
    // Simulate a bank that later refuses everything: authorization gone, card now declines.
    await a.query("update app.payments set stripe_payment_intent_id = 'pi_vanished', stripe_payment_method_id = 'pm_fake_decline_later' where video_order_id = $1", [id]);
    const fin = await uploadAndFinalize(cookie, id);
    assert.equal(fin.status, 200);
    assert.equal(fin.body.released, false);
    assert.equal(await videoStatus(h.token), 404, "video released without a successful capture");
    const st = await (await owner(h.token, h.ownerKey)).json();
    assert.equal(st.video.status, "ready");
    assert.equal(st.video.payment, "action_required");
    // Customer pays on-session; now (and only now) the video is released.
    const fix = await (await owner(h.token, h.ownerKey, "/video", { method: "POST", body: '{"fixPayment":true}' })).json();
    const sid = sessionFrom(fix.checkoutUrl);
    await fakePay(sid, "pay");
    await owner(h.token, h.ownerKey, "/video", { method: "POST", body: JSON.stringify({ confirm: sid }) });
    assert.equal((await payRow(h.token)).status, "captured");
    assert.equal(await videoStatus(h.token), 302);
  });

  test("cancelling after authorization releases the hold", async () => {
    const h = (await buyHug()).body;
    await bookVideo(h);
    const id = await orderId(h.token);
    await studio(cookie, `/orders/${id}`, { method: "PATCH", body: '{"status":"recording"}' });
    assert.equal((await payRow(h.token)).status, "authorized");
    assert.equal((await studio(cookie, `/orders/${id}`, { method: "PATCH", body: '{"status":"canceled","reason":"Lost my voice"}' })).status, 200);
    const p = (await a.query("select status::text from app.payments where video_order_id = $1", [id])).rows[0];
    assert.equal(p.status, "canceled");
  });

  test("a customer cancelling before recording is never charged", async () => {
    const h = (await buyHug()).body;
    await bookVideo(h);
    assert.equal((await owner(h.token, h.ownerKey, "/video", { method: "DELETE" })).status, 200);
    const p = (await a.query("select p.status::text, p.stripe_payment_intent_id from app.payments p join app.video_orders o on o.id = p.video_order_id join app.hugs h on h.id = o.hug_id where h.token = $1", [h.token])).rows[0];
    assert.deepEqual(p, { status: "canceled", stripe_payment_intent_id: null });
  });

  test("refunds and disputes: refunded videos stay; disputed videos are withheld until won", async () => {
    const h = (await buyHug()).body;
    await bookVideo(h);
    const id = await orderId(h.token);
    await studio(cookie, `/orders/${id}`, { method: "PATCH", body: '{"status":"recording"}' });
    await uploadAndFinalize(cookie, id);
    const pi = (await payRow(h.token)).stripe_payment_intent_id;

    await fakeAction({ action: "dispute", paymentIntentId: pi });
    await settle();
    assert.equal((await payRow(h.token)).status, "disputed");
    assert.equal(await videoStatus(h.token), 404);
    // Dispute won → released again (an event as Stripe would send it, signed).
    const won = signed({ id: `evt_${randomBytes(6).toString("hex")}`, object: "event", type: "charge.dispute.closed", created: 1, livemode: false, data: { object: { id: "dp_x", payment_intent: pi, status: "won" } } });
    assert.equal((await postWebhook(won.payload, won.header)).status, 200);
    assert.equal((await payRow(h.token)).status, "captured");
    assert.equal(await videoStatus(h.token), 302);

    assert.equal((await studio(cookie, `/orders/${id}/refund`, { method: "POST", body: '{"reason":"test"}' })).status, 200);
    await settle();
    const p = await payRow(h.token);
    assert.deepEqual([p.status, p.refunded_cents], ["refunded", 1500]);
    assert.equal(await videoStatus(h.token), 302); // the customer keeps the video
    assert.equal((await studio(cookie, `/orders/${id}/refund`, { method: "POST", body: "{}" })).status, 409); // no double refund
  });

  test("out-of-order events can't move a payment backwards", async () => {
    const h = (await buyHug()).body;
    await bookVideo(h);
    const id = await orderId(h.token);
    await studio(cookie, `/orders/${id}`, { method: "PATCH", body: '{"status":"recording"}' });
    await uploadAndFinalize(cookie, id);
    const pi = (await payRow(h.token)).stripe_payment_intent_id;
    for (const type of ["payment_intent.amount_capturable_updated", "payment_intent.payment_failed", "payment_intent.canceled"]) {
      const late = signed({ id: `evt_${randomBytes(6).toString("hex")}`, object: "event", type, created: 1, livemode: false, data: { object: { id: pi } } });
      assert.equal((await postWebhook(late.payload, late.header)).status, 200);
    }
    assert.equal((await payRow(h.token)).status, "captured");
  });

  test("an abandoned video checkout frees the slot; a late card save can't overbook", async () => {
    await a.query("delete from app.video_orders");
    // Through the studio setting, so existing days pick up the new default too.
    await a.query("update app.settings set booking_horizon_days = 1");
    assert.equal((await studio(cookie, "/settings", { method: "PATCH", body: '{"defaultCapacity":1}' })).status, 200);
    try {
      const h1 = (await buyHug()).body;
      const r = await (await owner(h1.token, h1.ownerKey, "/video", { method: "POST", body: "{}" })).json();
      const sid = sessionFrom(r.checkoutUrl);
      const h2 = (await buyHug()).body;
      assert.equal((await owner(h2.token, h2.ownerKey, "/video", { method: "POST", body: "{}" })).status, 409); // held for h1
      // h1's hold lapses while they dawdle; h2 takes the slot.
      await a.query("update app.video_orders set hold_expires_at = now() - interval '1 minute' where checkout_session_id = $1", [sid]);
      assert.equal((await bookVideo(h2)).status, 200);
      // h1 finally saves a card: no booking, nothing charged, no overbooking.
      await fakePay(sid, "pm_fake_ok");
      const c = await (await owner(h1.token, h1.ownerKey, "/video", { method: "POST", body: JSON.stringify({ confirm: sid }) })).json();
      assert.equal(c.checkout, "hold_expired");
      const n = (await a.query("select count(*)::int n from app.video_orders where status not in ('canceled','expired')")).rows[0].n;
      assert.equal(n, 1);
      assert.equal((await payRow(h1.token)) ?? null, null);
    } finally {
      await a.query("update app.settings set booking_horizon_days = 7");
      await studio(cookie, "/settings", { method: "PATCH", body: '{"defaultCapacity":5}' });
    }
  });
});

describe("retention", () => {
  test("after 30 days the hourly job deletes the video and the link stops working", async () => {
    const h = (await buyHug()).body;
    await bookVideo(h);
    const id = await orderId(h.token);
    await studio(cookie, `/orders/${id}`, { method: "PATCH", body: '{"status":"recording"}' });
    const fin = await uploadAndFinalize(cookie, id);
    assert.equal(await videoStatus(h.token), 302);
    await a.query("update app.video_orders set video_expires_at = now() - interval '1 minute' where id = $1", [id]);
    assert.equal(await videoStatus(h.token), 404); // hidden immediately
    const m = await (await fetch(`${BASE}/api/cron/maintenance`, { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } })).json();
    assert.ok(m.videosExpired >= 1);
    const { data } = await storage().from("hug-videos").list("", { search: fin.path });
    assert.equal(data?.length ?? 0, 0);
    assert.equal((await a.query("select status::text from app.video_orders where id = $1", [id])).rows[0].status, "expired");
  });
});
