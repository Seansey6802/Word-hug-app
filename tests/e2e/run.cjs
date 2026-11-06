// Mobile end-to-end tests on an emulated iPhone 13 (Playwright + Chromium),
// against a running app and the local Supabase stack.
//   npm run build && npm start   (in another terminal)
//   npm run test:e2e             (SHOTS=/some/dir to keep screenshots)
const { chromium, devices } = require("playwright");
const { Pool } = require("pg");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");

const BASE = process.env.TEST_BASE_URL || "http://localhost:3000";
const MAILPIT = "http://127.0.0.1:54324";
const SHOTS = process.env.SHOTS || path.join(__dirname, ".shots");
const ADMIN = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const PHOTO = path.join(__dirname, "../../public/photos/friends-sunset-embrace.jpg");
const VIDEO = path.join(__dirname, "fixtures/founder-test.mp4");
fs.mkdirSync(SHOTS, { recursive: true });

const a = new Pool({ connectionString: ADMIN });
const iphone = devices["iPhone 13"];
const results = [];
let browser;

async function step(name, fn) {
  const t = Date.now();
  try {
    await fn();
    results.push({ name, ok: true, ms: Date.now() - t });
    console.log(`ok - ${name}`);
  } catch (e) {
    results.push({ name, ok: false, error: e.message });
    console.log(`not ok - ${name}\n  ${e.message.split("\n").slice(0, 4).join("\n  ")}`);
  }
}

async function phone() {
  const ctx = await browser.newContext({ ...iphone });
  const page = await ctx.newPage();
  page.errors = [];
  page.on("pageerror", (e) => page.errors.push(e.message));
  page.on("dialog", (d) => d.accept(d.defaultValue() || undefined));
  return page;
}
const { createHmac, randomBytes } = require("node:crypto");
const SB = "http://127.0.0.1:54321";

/** RFC 6238 — what the founder's authenticator app shows. */
function totp(base32) {
  const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const ch of base32.replace(/=+$/, "").toUpperCase()) bits += A.indexOf(ch).toString(2).padStart(5, "0");
  const key = Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2)));
  const c = Buffer.alloc(8);
  c.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const h = createHmac("sha1", key).update(c).digest();
  const o = h[h.length - 1] & 0xf;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1e6).padStart(6, "0");
}

/** Creates an individual founder account (as `npm run staff:add` does). */
async function makeFounder() {
  const email = `founder-${randomBytes(3).toString("hex")}@example.com`;
  const password = `Studio-${randomBytes(9).toString("base64url")}9a`;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const r = await fetch(`${SB}/auth/v1/admin/users`, { method: "POST", headers: { apikey: key, Authorization: `Bearer ${key}`, "content-type": "application/json" }, body: JSON.stringify({ email, password, email_confirm: true }) });
  const u = await r.json();
  await a.query("insert into app.staff (user_id, email) values ($1, $2)", [u.id, email]);
  return { email, password, secret: null };
}

/** Completes the local test checkout page (stands in for Stripe Checkout). */
async function payOnCheckout(page, { card = null, name = "checkout" } = {}) {
  await page.waitForURL(/\/dev\/checkout\//);
  await page.getByText(/Test checkout/).waitFor();
  if (card) await page.locator(`input[value="${card}"]`).check();
  await shot(page, name);
  await page.getByRole("button", { name: card ? "Save card" : "Pay" }).click();
}

/** API-only purchase + booking, for filling slots. */
async function apiBuyAndBook(i) {
  const fd = new FormData();
  fd.set("data", JSON.stringify({ category: "laugh", tone: "playful", intensity: 2 }));
  const s = await (await fetch(`${BASE}/api/hugs`, { method: "POST", body: fd, headers: { "x-forwarded-for": `10.9.9.${i}` } })).json();
  const sid = s.checkoutUrl.split("/dev/checkout/")[1];
  await fetch(`${BASE}/api/dev/checkout`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sessionId: sid, choice: "pay" }) });
  const c = await (await fetch(`${BASE}/api/checkout/confirm`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sessionId: sid }) })).json();
  const hdr = { "x-owner-key": s.ownerKey, "content-type": "application/json" };
  const v = await (await fetch(`${BASE}/api/hugs/${c.token}/video`, { method: "POST", headers: hdr, body: "{}" })).json();
  const vsid = v.checkoutUrl.split("/dev/checkout/")[1];
  await fetch(`${BASE}/api/dev/checkout`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sessionId: vsid, choice: "pm_fake_ok" }) });
  const r = await (await fetch(`${BASE}/api/hugs/${c.token}/video`, { method: "POST", headers: hdr, body: JSON.stringify({ confirm: vsid }) })).json();
  assert.equal(r.state.video.status, "booked");
}

const shot = (page, name, full = false) => page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: full });

async function createHug(page, { forSelf = false, kind = /Encourage Me/, photo = false, name = "Maya", from = "Jess" } = {}) {
  await page.goto(`${BASE}/create`);
  await page.getByRole("button", { name: forSelf ? /For me/ : /For someone else/ }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: kind }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByPlaceholder(forSelf ? "e.g. Sam" : "e.g. Maya").fill(name);
  if (!forSelf) await page.getByPlaceholder("e.g. Jess").fill(from);
  await page.getByRole("button", { name: "Big day ahead" }).click();
  if (photo) {
    await page.locator("input[type=file]").setInputFiles(PHOTO);
    await page.getByText(/I have the right/).waitFor();
    assert.ok(await page.getByRole("button", { name: "Continue" }).isDisabled(), "continue enabled without consent");
    await page.getByText(/I have the right/).click();
    await page.getByText(/Also let the person recording/).click();
  }
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByText(/\$1/).first().waitFor();
  await page.getByRole("button", { name: "Pay $1 & wrap it" }).click();
  await payOnCheckout(page, { name: "02a-checkout-hug" });
  await page.waitForURL(/\/h\//, { timeout: 20000 });
  return page.url().split("/h/")[1].split(/[?#]/)[0];
}

async function openEnvelope(page) {
  await page.getByRole("button", { name: "Open your Word Hug" }).click();
  await page.waitForTimeout(8500);
}

let founder;
async function studioLogin(page, shotName) {
  founder ??= await makeFounder();
  await page.goto(`${BASE}/studio`);
  await page.getByPlaceholder("Email").fill(founder.email);
  await page.getByPlaceholder("Password").fill(founder.password);
  await page.getByRole("button", { name: "Continue" }).click();
  if (!founder.secret) {
    // First sign-in: enroll an authenticator app from the QR code / setup key.
    await page.getByAltText("Authenticator QR code").waitFor();
    if (shotName) await shot(page, shotName);
    founder.secret = (await page.getByText(/^Or enter:/).textContent()).replace("Or enter:", "").trim();
    await page.getByLabel("Authenticator code").fill(totp(founder.secret));
    await page.getByRole("button", { name: "Verify and enter" }).click();
  } else {
    await page.getByLabel("Authenticator code").fill(totp(founder.secret));
    await page.getByRole("button", { name: "Enter the studio" }).click();
  }
  await page.getByText("Good to see you").waitFor();
}

(async () => {
  await a.query("truncate app.hugs, app.customers, app.recording_days, app.studio_sessions, app.rate_limits cascade");
  // Allow same-day booking so the run doesn't depend on the clock.
  await a.query("update app.settings set default_daily_capacity = 5, booking_horizon_days = 7, same_day_cutoff_hour = 24, paused = false, recording_weekdays = '{1,2,3,4,5,6,7}'");
  browser = await chromium.launch();
  let giftToken;

  await step("homepage renders with live availability and one primary action", async () => {
    const p = await phone();
    await p.goto(BASE, { waitUntil: "networkidle" });
    await shot(p, "01-home");
    const ctas = await p.getByRole("link", { name: /Get a Word Hug/ }).count();
    assert.ok(ctas >= 1);
    await p.getByText(/Next recording day: today · 5 of 5 slots open/).waitFor();
    assert.deepEqual(p.errors, []);
  });

  await step("create a gift hug with a consented photo, open the envelope", async () => {
    const p = await phone();
    giftToken = await createHug(p, { photo: true });
    await shot(p, "02-envelope");
    await openEnvelope(p);
    await shot(p, "03-letter");
    const img = p.locator("article img");
    await img.waitFor();
    assert.ok(await img.evaluate((el) => el.complete && el.naturalWidth > 0), "photo didn't load through the signed link");

    // Book the founder video for the next available day.
    await p.getByRole("button", { name: /Add a founder video · \$15/ }).click();
    await p.getByPlaceholder(/pronounce/).fill("MY-uh. She'll pretend to hate it.");
    await p.getByRole("button", { name: /Book today · \$15/ }).click();
    await payOnCheckout(p, { card: "pm_fake_ok", name: "04a-checkout-save-card" });
    await p.waitForURL(/\/h\//);
    await openEnvelope(p);
    await p.getByText(/Booked for/).waitFor();
    await p.getByText(/only after your video is uploaded/).waitFor();
    await p.getByText(/Booked for/).scrollIntoViewIfNeeded();
    await shot(p, "04-booked");

    // Keep this hug safe: recovery email.
    await p.getByLabel("Recovery email").fill("maya.demo@example.com");
    await p.getByRole("button", { name: "Save email" }).click();
    await p.getByText(/A recovery email is attached/).waitFor();
    assert.deepEqual(p.errors, []);
  });

  await step("founder records on the phone; the hug shows ready only after upload", async () => {
    const p = await phone();
    await studioLogin(p, "05a-studio-mfa-setup");
    const card = p.locator("li", { hasText: "For Maya" });
    await card.getByText("Card saved · not charged").waitFor();
    await card.getByRole("button", { name: "Start recording" }).click();
    await card.getByText("Upload recording").waitFor();
    await card.getByText(/\$15 authorized/).waitFor();
    // Not ready yet for the recipient:
    const before = await fetch(`${BASE}/api/hugs/${giftToken}/video/file`, { redirect: "manual" });
    assert.equal(before.status, 404);
    await shot(p, "05-studio-recording");
    await card.locator("input[type=file]").setInputFiles(VIDEO);
    await p.getByRole("button", { name: /Delivered 1/ }).waitFor({ timeout: 20000 });
    await p.getByRole("button", { name: /Delivered 1/ }).click();
    await p.getByText("Uploaded · ready").waitFor();
    await p.getByText("$15 captured").waitFor();
    await shot(p, "06-studio-delivered");
    const after = await fetch(`${BASE}/api/hugs/${giftToken}/video/file`, { redirect: "manual" });
    assert.equal(after.status, 302);
    assert.deepEqual(p.errors, []);
  });

  await step("recipient opens the gift link and can play the video", async () => {
    const p = await phone();
    await p.goto(`${BASE}/h/${giftToken}`);
    await p.getByText(/Someone sent you a/).waitFor();
    await openEnvelope(p);
    const v = p.locator("video");
    await v.waitFor();
    await p.waitForFunction(() => document.querySelector("video")?.readyState >= 1, null, { timeout: 15000 });
    await shot(p, "07-recipient-video");
    assert.equal(await p.getByRole("button", { name: /founder video/ }).count(), 0, "recipient sees owner controls");
    assert.deepEqual(p.errors, []);
  });

  await step("when days are full, customers join the free waitlist and get a held slot", async () => {
    await a.query("update app.settings set booking_horizon_days = 1");
    // Fill today's remaining 4 slots with paid, booked demo hugs via the API.
    for (let i = 0; i < 4; i++) await apiBuyAndBook(i);
    const p = await phone();
    const token = await createHug(p, { forSelf: true, kind: /Make Me Laugh/, name: "Sam" });
    await openEnvelope(p);
    await p.getByText(/Every recording day in the next week is full/).waitFor();
    await p.getByRole("button", { name: "Join the free waitlist" }).click();
    await p.getByRole("button", { name: "Join the free waitlist" }).click();
    await p.getByText(/You’re on the list/).waitFor();
    await p.getByText(/You’re on the list/).scrollIntoViewIfNeeded();
    await shot(p, "08-waitlist");
    // A booked customer cancels → Sam gets a held slot.
    const id = (await a.query(`select o.id from app.video_orders o join app.hugs h on h.id = o.hug_id where o.status = 'booked' and h.category = 'laugh' limit 1`)).rows[0].id;
    await a.query("select app.cancel_video($1, 'customer', 'test')", [id]);
    await p.reload();
    await openEnvelope(p);
    await p.getByText(/A slot opened up/).waitFor();
    await p.getByText(/A slot opened up/).scrollIntoViewIfNeeded();
    await shot(p, "09-held");
    await p.getByRole("button", { name: /Book it · \$15/ }).click();
    await payOnCheckout(p, { card: "pm_fake_ok", name: "09a-checkout-held" });
    await p.waitForURL(/\/h\//);
    await openEnvelope(p);
    await p.getByText(/Booked for/).waitFor();
    const s = (await a.query("select status from app.video_orders o join app.hugs h on h.id = o.hug_id where h.token = $1 and o.status <> 'canceled'", [token])).rows[0];
    assert.equal(s.status, "booked");
    await a.query("update app.settings set booking_horizon_days = 7");
    assert.deepEqual(p.errors, []);
  });

  await step("a declined card stops recording; the customer fixes it; nothing is charged early", async () => {
    // Make room today (earlier steps filled it).
    await a.query("update app.settings set default_daily_capacity = 10");
    await a.query("update app.recording_days set capacity = 10");
    const p = await phone();
    const token = await createHug(p, { forSelf: true, kind: /Flirt With Me/, name: "Lee" });
    await openEnvelope(p);
    await p.getByRole("button", { name: /Add a founder video/ }).click();
    await p.getByRole("button", { name: /Book today · \$15/ }).click();
    await payOnCheckout(p, { card: "pm_fake_decline_later" });
    await p.waitForURL(/\/h\//);
    const s = await phone();
    await studioLogin(s);
    const card = s.locator("li", { hasText: "For Lee" });
    await card.getByRole("button", { name: "Start recording" }).click();
    await card.getByText(/couldn't be authorized \(insufficient_funds\)/).waitFor();
    await card.getByText(/needs the customer/).waitFor();
    await shot(s, "11-studio-payment-blocked");
    // The customer sees a clear prompt and re-authorizes on-session.
    await p.reload();
    await openEnvelope(p);
    await p.getByText(/Your bank needs you to approve/).waitFor();
    await p.getByText(/Your bank needs you to approve/).scrollIntoViewIfNeeded();
    await shot(p, "12-customer-update-payment");
    await p.getByRole("button", { name: "Update payment" }).click();
    await payOnCheckout(p);
    await p.waitForURL(/\/h\//);
    await new Promise((r) => setTimeout(r, 1500));
    const pay = (await a.query("select p.status::text from app.payments p join app.video_orders o on o.id = p.video_order_id join app.hugs h on h.id = o.hug_id where h.token = $1", [token])).rows[0];
    assert.equal(pay.status, "authorized");
    assert.deepEqual(p.errors, []);
    assert.deepEqual(s.errors, []);
  });

  await step("recovering hugs on a new phone by email", async () => {
    await fetch(`${MAILPIT}/api/v1/messages`, { method: "DELETE" });
    const p = await phone(); // a fresh device: no local hugs
    await p.goto(`${BASE}/saved`);
    await p.getByRole("link", { name: /Recover your hugs by email/ }).click();
    await p.getByPlaceholder("you@example.com").fill("maya.demo@example.com");
    await p.getByRole("button", { name: "Send recovery link" }).click();
    await p.getByText(/a recovery link is on its way/).waitFor();
    await new Promise((r) => setTimeout(r, 600));
    const list = await (await fetch(`${MAILPIT}/api/v1/messages`)).json();
    const msg = await (await fetch(`${MAILPIT}/api/v1/message/${list.messages[0].ID}`)).json();
    const link = /(http\S+\/recover#t=[A-Za-z0-9_-]+)/.exec(msg.Text)[1];
    await p.goto(link);
    await p.getByText(/Welcome back/).waitFor();
    await shot(p, "10-recovered");
    await p.getByRole("link", { name: /A Word Hug for Maya/ }).click();
    await openEnvelope(p);
    await p.getByText(/Privacy & deletion/).waitFor(); // owner controls are back
    assert.deepEqual(p.errors, []);
  });

  await step("owner deletes the hug: link, photo and video are gone", async () => {
    const p = await phone();
    const before = (await a.query("select count(*)::int as n from storage.objects where bucket_id in ('hug-photos','hug-videos')")).rows[0].n;
    // Owner controls on this fresh device come from a new recovery link.
    await fetch(`${MAILPIT}/api/v1/messages`, { method: "DELETE" });
    await fetch(`${BASE}/api/recovery/request`, { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "10.7.7.7" }, body: JSON.stringify({ email: "maya.demo@example.com" }) });
    await new Promise((r) => setTimeout(r, 600));
    const list = await (await fetch(`${MAILPIT}/api/v1/messages`)).json();
    const msg = await (await fetch(`${MAILPIT}/api/v1/message/${list.messages[0].ID}`)).json();
    await p.goto(/(http\S+\/recover#t=[A-Za-z0-9_-]+)/.exec(msg.Text)[1]);
    await p.getByRole("link", { name: /A Word Hug for Maya/ }).click();
    await openEnvelope(p);
    await p.getByText("Privacy & deletion").click();
    await p.getByRole("button", { name: "Delete this hug" }).click();
    await p.waitForURL(/\/saved\?deleted=1/);
    await p.getByText(/gone for good/).waitFor();
    const after = (await a.query("select count(*)::int as n from storage.objects where bucket_id in ('hug-photos','hug-videos')")).rows[0].n;
    assert.equal(before - after, 2, `expected photo + video removed (before ${before}, after ${after})`);
    assert.equal((await fetch(`${BASE}/api/hugs/${giftToken}/photo`, { redirect: "manual" })).status, 404);
  });

  await browser.close();
  await a.query("update app.settings set same_day_cutoff_hour = 17, booking_horizon_days = 7, recording_weekdays = '{1,2,3,4,5}', default_daily_capacity = 5");
  await a.end();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n# pass ${results.length - failed.length}\n# fail ${failed.length}\nScreenshots: ${SHOTS}`);
  process.exit(failed.length ? 1 : 0);
})().catch(async (e) => {
  console.error(e);
  await browser?.close();
  process.exit(1);
});
