// End-to-end API tests against a running app (npm run build && npm start) and
// the local Supabase stack. Each test uses its own fake client IP so rate
// limits don't interfere with each other.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { admin, resetData, restoreDefaults, storage } from "../db/helpers.ts";

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:3000";
const MAILPIT = "http://127.0.0.1:54324";
const a = admin();
const ip = () => `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
const JPEG = readFileSync(new URL("../../public/photos/gift-held-out.jpg", import.meta.url));

before(() => resetData(a));
after(async () => {
  await restoreDefaults(a);
  await a.end();
});

async function createHug(opts: { photo?: boolean; consent?: boolean; forVideo?: boolean; bytes?: Uint8Array; type?: string } = {}) {
  const fd = new FormData();
  fd.set("data", JSON.stringify({ forSelf: false, category: "roast", tone: "deadpan", intensity: 2, recipientName: "Maya", senderName: "Jess", photoConsent: opts.consent ?? true, photoForVideo: opts.forVideo ?? false }));
  if (opts.photo) fd.set("photo", new Blob([(opts.bytes ?? new Uint8Array(JPEG)) as BlobPart], { type: opts.type ?? "image/jpeg" }), "p.jpg");
  const r = await fetch(`${BASE}/api/hugs`, { method: "POST", body: fd, headers: { "x-forwarded-for": ip() } });
  return { status: r.status, body: await r.json() };
}

const owner = (token: string, key: string, path = "", init: RequestInit = {}) =>
  fetch(`${BASE}/api/hugs/${token}${path}`, { ...init, redirect: "manual", headers: { "x-owner-key": key, "content-type": "application/json", ...(init.headers ?? {}) } });

async function studioCookie() {
  const r = await fetch(`${BASE}/api/studio/session`, { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": ip() }, body: JSON.stringify({ passcode: "demo-studio" }) });
  assert.equal(r.status, 200);
  return r.headers.get("set-cookie")!.split(";")[0];
}
const studio = (cookie: string, path: string, init: RequestInit = {}) =>
  fetch(`${BASE}/api/studio${path}`, { ...init, redirect: "manual", headers: { cookie, "content-type": "application/json", ...(init.headers ?? {}) } });

describe("ownership & access control", () => {
  test("owner endpoints refuse missing, wrong, and other hugs' keys", async () => {
    const h1 = (await createHug()).body;
    const h2 = (await createHug()).body;
    for (const [path, method] of [["", "GET"], ["", "PATCH"], ["", "DELETE"], ["/photo", "DELETE"], ["/video", "POST"], ["/waitlist", "POST"], ["/email", "POST"]]) {
      for (const key of ["", "wrong-key-wrong-key-wrong-key-00", h2.ownerKey]) {
        const r = await owner(h1.token, key, path, { method, body: method === "GET" ? undefined : "{}" });
        assert.equal(r.status, 403, `${method} ${path} with key "${key.slice(0, 6)}" → ${r.status}`);
      }
    }
    assert.equal((await owner(h1.token, h1.ownerKey)).status, 200);
  });

  test("malformed and unknown tokens look identical (404)", async () => {
    for (const t of ["x", "../../etc/passwd", "A".repeat(22), "%00"]) {
      const r = await fetch(`${BASE}/api/hugs/${t}/photo`, { redirect: "manual" });
      assert.equal(r.status, 404);
    }
    assert.equal((await fetch(`${BASE}/h/${"B".repeat(22)}`)).status, 200); // friendly "let go" page, no leak
  });

  test("studio endpoints require a real session", async () => {
    for (const cookie of ["", "wh_studio=forged", `wh_studio=${randomBytes(32).toString("base64url")}`]) {
      assert.equal((await studio(cookie, "/orders")).status, 401);
      assert.equal((await studio(cookie, "/settings", { method: "PATCH", body: '{"paused":true}' })).status, 401);
    }
    const bad = await fetch(`${BASE}/api/studio/session`, { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": ip() }, body: '{"passcode":"nope"}' });
    assert.equal(bad.status, 401);
  });

  test("studio login is rate limited", async () => {
    const who = ip();
    const codes: number[] = [];
    for (let i = 0; i < 12; i++) {
      const r = await fetch(`${BASE}/api/studio/session`, { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": who }, body: '{"passcode":"guess"}' });
      codes.push(r.status);
    }
    assert.ok(codes.slice(10).every((c) => c === 429), codes.join(","));
  });

  test("signing out revokes the session server-side", async () => {
    const cookie = await studioCookie();
    assert.equal((await studio(cookie, "/orders")).status, 200);
    await studio(cookie, "/session", { method: "DELETE" });
    assert.equal((await studio(cookie, "/orders")).status, 401);
  });
});

describe("photos: consent, privacy, deletion, expiry", () => {
  test("a photo without consent is refused; a disguised file is refused", async () => {
    assert.equal((await createHug({ photo: true, consent: false })).status, 400);
    const html = new TextEncoder().encode("<html><script>alert(1)</script></html>");
    assert.equal((await createHug({ photo: true, bytes: html, type: "image/jpeg" })).status, 400);
  });

  test("photos are served only through short-lived signed links", async () => {
    const h = (await createHug({ photo: true })).body;
    const r = await fetch(`${BASE}/api/hugs/${h.token}/photo`, { redirect: "manual" });
    assert.equal(r.status, 302);
    const loc = r.headers.get("location")!;
    assert.match(loc, /\/storage\/v1\/object\/sign\/hug-photos\/.+\?token=/);
    const jwt = JSON.parse(Buffer.from(new URL(loc).searchParams.get("token")!.split(".")[1], "base64url").toString());
    assert.ok(jwt.exp - jwt.iat <= 600, "photo link lives longer than 10 minutes");
    const img = await fetch(loc);
    assert.equal(img.status, 200);
    assert.equal(img.headers.get("content-type"), "image/jpeg");
  });

  test("owner deletion removes the photo from storage immediately", async () => {
    const h = (await createHug({ photo: true })).body;
    const path = (await a.query("select storage_path from app.hug_photos p join app.hugs h on h.id = p.hug_id where h.token = $1", [h.token])).rows[0].storage_path;
    assert.equal((await owner(h.token, h.ownerKey, "/photo", { method: "DELETE" })).status, 200);
    assert.equal((await fetch(`${BASE}/api/hugs/${h.token}/photo`, { redirect: "manual" })).status, 404);
    const { data } = await storage().from("hug-photos").list("", { search: path });
    assert.equal(data?.length ?? 0, 0);
  });

  test("expired photos vanish at once, and the hourly job deletes the file", async () => {
    const h = (await createHug({ photo: true })).body;
    const path = (await a.query("select storage_path from app.hug_photos p join app.hugs h on h.id = p.hug_id where h.token = $1", [h.token])).rows[0].storage_path;
    await a.query(
      `update app.hug_photos set consent_at = now() - interval '31 days', expires_at = now() - interval '1 day'
        where storage_path = $1`,
      [path],
    );
    assert.equal((await fetch(`${BASE}/api/hugs/${h.token}/photo`, { redirect: "manual" })).status, 404);
    assert.equal((await fetch(`${BASE}/api/cron/maintenance`)).status, 401);
    const r = await fetch(`${BASE}/api/cron/maintenance`, { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } });
    assert.equal(r.status, 200);
    assert.ok((await r.json()).photosDeleted >= 1);
    const { data } = await storage().from("hug-photos").list("", { search: path });
    assert.equal(data?.length ?? 0, 0);
    assert.equal((await a.query("select 1 from app.hug_photos where storage_path = $1", [path])).rowCount, 0);
  });

  test("the founder sees a photo only if the customer allowed it", async () => {
    const cookie = await studioCookie();
    for (const forVideo of [false, true]) {
      const h = (await createHug({ photo: true, forVideo })).body;
      assert.equal((await owner(h.token, h.ownerKey, "/video", { method: "POST", body: "{}" })).status, 200);
      const id = (await a.query("select o.id from app.video_orders o join app.hugs h on h.id = o.hug_id where h.token = $1", [h.token])).rows[0].id;
      const r = await studio(cookie, `/orders/${id}/photo`);
      assert.equal(r.status, forVideo ? 302 : 404);
    }
  });
});

describe("video: booking, honesty, delivery", () => {
  test("full founder flow: book → record → signed upload → verified ready → recipient plays it", async () => {
    const h = (await createHug()).body;
    const booked = await (await owner(h.token, h.ownerKey, "/video", { method: "POST", body: '{"note":"MY-uh"}' })).json();
    assert.equal(booked.video.status, "booked");
    assert.equal((await owner(h.token, h.ownerKey, "/video", { method: "POST", body: "{}" })).status, 409); // no double booking
    const id = booked.video.id;
    const cookie = await studioCookie();

    // The studio can't simply declare it ready.
    assert.equal((await studio(cookie, `/orders/${id}`, { method: "PATCH", body: '{"status":"ready"}' })).status, 409);
    // Can't get an upload link before recording starts.
    assert.equal((await studio(cookie, `/orders/${id}/upload-url`, { method: "POST", body: '{"mime":"video/mp4"}' })).status, 409);
    assert.equal((await studio(cookie, `/orders/${id}`, { method: "PATCH", body: '{"status":"recording"}' })).status, 200);
    // Finalizing without an actual file fails.
    assert.equal((await studio(cookie, `/orders/${id}/finalize`, { method: "POST", body: '{"path":"nothinghere00001.mp4"}' })).status, 409);
    assert.equal((await fetch(`${BASE}/api/hugs/${h.token}/video/file`, { redirect: "manual" })).status, 404);
    // Customer can't cancel mid-recording.
    assert.equal((await owner(h.token, h.ownerKey, "/video", { method: "DELETE" })).status, 409);

    const up = await (await studio(cookie, `/orders/${id}/upload-url`, { method: "POST", body: '{"mime":"video/mp4"}' })).json();
    const put = await fetch(up.url, { method: "PUT", headers: { "content-type": "video/mp4" }, body: new Uint8Array(40000) });
    assert.ok(put.ok, `upload ${put.status}`);
    // A signed upload URL is single-use.
    const again = await fetch(up.url, { method: "PUT", headers: { "content-type": "video/mp4" }, body: new Uint8Array(40000) });
    assert.ok(!again.ok, "upload URL could be reused");
    assert.equal((await studio(cookie, `/orders/${id}/finalize`, { method: "POST", body: JSON.stringify({ path: up.path }) })).status, 200);

    const st = await (await owner(h.token, h.ownerKey)).json();
    assert.equal(st.video.status, "ready");
    const file = await fetch(`${BASE}/api/hugs/${h.token}/video/file`, { redirect: "manual" });
    assert.equal(file.status, 302);
    const vid = await fetch(file.headers.get("location")!, { headers: { range: "bytes=0-99" } });
    assert.equal(vid.status, 206); // range requests work (iOS Safari needs them)

    // Deleting the hug removes the video object too.
    assert.equal((await owner(h.token, h.ownerKey, "", { method: "DELETE" })).status, 200);
    const { data } = await storage().from("hug-videos").list("", { search: up.path });
    assert.equal(data?.length ?? 0, 0);
    assert.equal((await fetch(`${BASE}/api/hugs/${h.token}/video/file`, { redirect: "manual" })).status, 404);
  });

  test("30 customers racing for one 5-slot day through the real API", async () => {
    await resetData(a);
    await a.query("update app.settings set booking_horizon_days = 1");
    const hugs = await Promise.all(Array.from({ length: 30 }, () => createHug().then((r) => r.body)));
    const codes = await Promise.all(hugs.map((h) => owner(h.token, h.ownerKey, "/video", { method: "POST", body: "{}" }).then((r) => r.status)));
    assert.equal(codes.filter((c) => c === 200).length, 5, codes.join(","));
    assert.equal(codes.filter((c) => c === 409).length, 25);
    const n = (await a.query("select count(*)::int as n from app.video_orders where status <> 'canceled'")).rows[0].n;
    assert.equal(n, 5);
    // Everyone else is offered the free waitlist.
    const late = hugs.find((_, k) => codes[k] === 409)!;
    const wl = await (await owner(late.token, late.ownerKey, "/waitlist", { method: "POST", body: "{}" })).json();
    assert.equal(wl.waitlist.status, "waiting");
    assert.equal(wl.nextAvailable, null);
    await a.query("update app.settings set booking_horizon_days = 14");
  });
});

describe("ownership recovery", () => {
  test("email recovery is one-time, expiring, and rotates the lost device's key", async () => {
    await fetch(`${MAILPIT}/api/v1/messages`, { method: "DELETE" });
    const h = (await createHug()).body;
    const email = `test-${randomBytes(4).toString("hex")}@example.com`;
    assert.equal((await owner(h.token, h.ownerKey, "/email", { method: "POST", body: JSON.stringify({ email }) })).status, 200);

    const reqRecover = (e: string) =>
      fetch(`${BASE}/api/recovery/request`, { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": ip() }, body: JSON.stringify({ email: e }) });
    const r1 = await (await reqRecover(email)).json();
    const r2 = await (await reqRecover("nobody@example.com")).json();
    assert.deepEqual(r1, r2, "response reveals whether an email has hugs");

    await new Promise((r) => setTimeout(r, 500));
    const list = await (await fetch(`${MAILPIT}/api/v1/messages`)).json();
    assert.equal(list.messages.length, 1, "expected exactly one email (none for unknown address)");
    const msg = await (await fetch(`${MAILPIT}/api/v1/message/${list.messages[0].ID}`)).json();
    const token = /#t=([A-Za-z0-9_-]+)/.exec(msg.Text)![1];

    const redeem = () => fetch(`${BASE}/api/recovery/redeem`, { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": ip() }, body: JSON.stringify({ token }) });
    const out = await (await redeem()).json();
    assert.equal(out.hugs.length, 1);
    const newKey = out.hugs[0].ownerKey;
    assert.equal((await owner(h.token, newKey)).status, 200);
    assert.equal((await owner(h.token, h.ownerKey)).status, 403, "old device key still works");
    assert.equal((await redeem()).status, 400, "recovery link reusable");

    const dbRow = (await a.query("select token_hash, used_at from app.recovery_tokens")).rows[0];
    assert.ok(dbRow.used_at);
    assert.notEqual(dbRow.token_hash, token, "token stored in plain text");
  });
});

describe("headers", () => {
  test("gift pages are noindex/no-referrer and APIs are no-store", async () => {
    const h = (await createHug()).body;
    const page = await fetch(`${BASE}/h/${h.token}`);
    assert.match(page.headers.get("x-robots-tag") ?? "", /noindex/);
    assert.equal(page.headers.get("referrer-policy"), "no-referrer");
    const api = await owner(h.token, h.ownerKey);
    assert.match(api.headers.get("cache-control") ?? "", /no-store/);
  });
});
