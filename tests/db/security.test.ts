import { after, before, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { APP_TABLES, PUBLISHABLE, admin, appPool, makeHug, resetData, restoreDefaults, sqlState, storage } from "./helpers.ts";

const a = admin();
const app = appPool(4);
before(() => resetData(a));
beforeEach(() => resetData(a));
after(async () => {
  await restoreDefaults(a);
  await a.end();
  await app.end();
});

describe("row-level security and privileges", () => {
  test("RLS is enabled and FORCED on every app table", async () => {
    const { rows } = await a.query(
      `select c.relname, c.relrowsecurity, c.relforcerowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'app' and c.relkind = 'r'`,
    );
    assert.equal(rows.length, APP_TABLES.length);
    for (const r of rows) {
      assert.ok(r.relrowsecurity, `${r.relname} RLS off`);
      assert.ok(r.relforcerowsecurity, `${r.relname} RLS not forced`);
    }
  });

  for (const role of ["anon", "authenticated"]) {
    test(`${role} can read nothing in the app schema`, async () => {
      await makeHug(a);
      const c = await a.connect();
      try {
        for (const t of APP_TABLES) {
          await c.query("begin");
          await c.query(`set local role ${role}`);
          const state = await sqlState(c.query(`select * from app.${t} limit 1`));
          await c.query("rollback");
          assert.equal(state, "42501", `${role} could query app.${t}`);
        }
        await c.query("begin");
        await c.query(`set local role ${role}`);
        assert.equal(await sqlState(c.query("select * from app.next_available_day()")), "42501");
        await c.query("rollback");
      } finally {
        c.release();
      }
    });
  }

  test("the public REST API does not expose the app schema", async () => {
    const base = `${process.env.SUPABASE_URL}/rest/v1`;
    const r1 = await fetch(`${base}/hugs`, { headers: { apikey: PUBLISHABLE, "Accept-Profile": "app" } });
    assert.equal(r1.status, 406);
    const r2 = await fetch(`${base}/hugs`, { headers: { apikey: PUBLISHABLE } });
    assert.equal(r2.status, 404);
    const r3 = await fetch(`${base}/rpc/book_video`, { method: "POST", headers: { apikey: PUBLISHABLE, "Content-Profile": "app", "content-type": "application/json" }, body: "{}" });
    assert.ok(r3.status >= 400);
  });

  test("the app role cannot bypass the booking engine or reach other schemas", async () => {
    const [hug] = await makeHug(a);
    await a.query("insert into app.recording_days (day, capacity) values (current_date, 5)");
    assert.equal(await sqlState(app.query("insert into app.video_orders (hug_id, recording_day) values ($1, current_date)", [hug])), "42501");
    assert.equal(await sqlState(app.query("update app.video_orders set status = 'ready'")), "42501");
    assert.equal(await sqlState(app.query("insert into app.video_waitlist (hug_id) values ($1)", [hug])), "42501");
    assert.equal(await sqlState(app.query("update app.settings set timezone = 'UTC'")), "42501");
    assert.equal(await sqlState(app.query("select * from storage.objects limit 1")), "42501");
    assert.equal(await sqlState(app.query("select * from auth.users limit 1")), "42501");
    assert.equal(await sqlState(app.query("select app._lock_free_day()")), "42501");
    assert.equal(await sqlState(app.query("update app.products set amount_cents = 1")), "42501");
    const { rows } = await app.query("select rolsuper, rolbypassrls from pg_roles where rolname = current_user");
    assert.deepEqual(rows[0], { rolsuper: false, rolbypassrls: false });
  });
});

describe("photo consent and expiry", () => {
  test("a photo row cannot exist without consent, or beyond 30 days", async () => {
    const [hug] = await makeHug(a);
    const ins = (consentAt: string, text: string | null, expires: string) =>
      app.query(
        `insert into app.hug_photos (hug_id, storage_path, mime, bytes, consent_at, consent_text, consent_version, expires_at)
         values ($1, 'abcdefghijklmnop.jpg', 'image/jpeg', 100, ${consentAt}, $2, 'v1', ${expires})`,
        [hug, text],
      );
    const longText = "I have the right to share this photo and consent to private storage.";
    assert.equal(await sqlState(ins("now()", null, "now() + interval '1 day'")), "23502"); // no consent text
    assert.equal(await sqlState(ins("now()", "ok", "now() + interval '1 day'")), "23514"); // consent text too short
    assert.equal(await sqlState(ins("now()", longText, "now() + interval '31 days'")), "23514"); // > 30 days
    assert.equal(await sqlState(ins("now()", longText, "now() + interval '30 days'")), "ok");
  });

  test("expired photos are invisible to the app role even before deletion", async () => {
    const [hug] = await makeHug(a);
    await a.query(
      `insert into app.hug_photos (hug_id, storage_path, mime, bytes, consent_at, consent_text, consent_version, expires_at)
       values ($1, 'expiredphoto0001.jpg', 'image/jpeg', 100, now() - interval '31 days',
               'I have the right to share this photo and consent to private storage.', 'v1', now() - interval '1 day')`,
      [hug],
    );
    assert.equal((await app.query("select * from app.hug_photos")).rowCount, 0);
    const exp = await app.query("select * from app.expired_photo_paths()");
    assert.equal(exp.rowCount, 1);
    await app.query("select app.forget_expired_photo($1)", [hug]);
    assert.equal((await a.query("select * from app.hug_photos")).rowCount, 0);
  });

  test("the founder can see a photo only with the customer's permission", async () => {
    const [hug] = await makeHug(a);
    await app.query("select * from app.book_video($1, '')", [hug]);
    const { rows } = await a.query("select id from app.video_orders where hug_id = $1", [hug]);
    await a.query(
      `insert into app.hug_photos (hug_id, storage_path, mime, bytes, consent_at, consent_text, consent_version, allow_for_video, expires_at)
       values ($1, 'founderphoto0001.jpg', 'image/jpeg', 100, now(), 'I have the right to share this photo and consent to private storage.', 'v1', false, now() + interval '1 day')`,
      [hug],
    );
    const q = () => app.query("select app.studio_photo_path($1) as p", [rows[0].id]).then((r) => r.rows[0].p);
    assert.equal(await q(), null);
    await a.query("update app.hug_photos set allow_for_video = true");
    assert.equal(await q(), "founderphoto0001.jpg");
  });
});

describe("ready requires a real upload", () => {
  test("not even a superuser can mark a video ready without a stored object", async () => {
    const [hug] = await makeHug(a);
    await app.query("select * from app.book_video($1, '')", [hug]);
    const { rows } = await a.query("select id from app.video_orders where hug_id = $1", [hug]);
    const id = rows[0].id;
    await app.query("select app.set_recording($1, true)", [id]);
    // Direct UPDATE as superuser: blocked by the trigger.
    const state = await sqlState(
      a.query(
        `update app.video_orders set status = 'ready', video_path = 'nofile000000001.mp4', video_mime = 'video/mp4', video_bytes = 99999, uploaded_at = now() where id = $1`,
        [id],
      ),
    );
    assert.equal(state, "WH005");
    // The function path: also blocked.
    assert.equal(await sqlState(app.query("select app.mark_video_ready($1, 'nofile000000001.mp4')", [id])), "WH005");
    // Constraint: ready without columns is impossible regardless of trigger.
    assert.equal(await sqlState(a.query("alter table app.video_orders disable trigger video_ready_requires_object; update app.video_orders set status='ready' where id = '" + id + "'")), "23514");
    await a.query("alter table app.video_orders enable trigger video_ready_requires_object");
  });

  test("a real upload through a signed URL makes it ready", async () => {
    const [hug] = await makeHug(a);
    await app.query("select * from app.book_video($1, '')", [hug]);
    const { rows } = await a.query("select id from app.video_orders where hug_id = $1", [hug]);
    await app.query("select app.set_recording($1, true)", [rows[0].id]);
    const s = storage();
    const path = `${randomBytes(12).toString("base64url")}.mp4`;
    const { data, error } = await s.from("hug-videos").createSignedUploadUrl(path);
    assert.ifError(error);
    const up = await s.from("hug-videos").uploadToSignedUrl(path, data!.token, new Blob([new Uint8Array(20000)], { type: "video/mp4" }), { contentType: "video/mp4" });
    assert.ifError(up.error);
    await app.query("select app.mark_video_ready($1, $2)", [rows[0].id, path]);
    const v = (await a.query("select status, video_bytes from app.video_orders where id = $1", [rows[0].id])).rows[0];
    assert.equal(v.status, "ready");
    assert.equal(Number(v.video_bytes), 20000);
    await s.from("hug-videos").remove([path]);
  });
});

describe("private storage", () => {
  test("anonymous clients cannot list, read or write media", async () => {
    const s = storage();
    const path = `${randomBytes(12).toString("base64url")}.jpg`;
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...new Uint8Array(100)]);
    assert.ifError((await s.from("hug-photos").upload(path, jpeg, { contentType: "image/jpeg" })).error);
    const base = `${process.env.SUPABASE_URL}/storage/v1`;
    const h = { apikey: PUBLISHABLE, Authorization: `Bearer ${PUBLISHABLE}` };
    assert.notEqual((await fetch(`${base}/object/public/hug-photos/${path}`)).status, 200);
    assert.notEqual((await fetch(`${base}/object/authenticated/hug-photos/${path}`, { headers: h })).status, 200);
    const list = await fetch(`${base}/object/list/hug-photos`, { method: "POST", headers: { ...h, "content-type": "application/json" }, body: JSON.stringify({ prefix: "" }) });
    const items = list.ok ? await list.json() : [];
    assert.equal(items.length, 0, "anon could list objects");
    const put = await fetch(`${base}/object/hug-photos/evil.jpg`, { method: "POST", headers: { ...h, "content-type": "image/jpeg" }, body: jpeg });
    assert.notEqual(put.status, 200);
    await s.from("hug-photos").remove([path]);
  });

  test("signed links work, then expire", async () => {
    const s = storage();
    const path = `${randomBytes(12).toString("base64url")}.jpg`;
    await s.from("hug-photos").upload(path, new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]), { contentType: "image/jpeg" });
    const { data } = await s.from("hug-photos").createSignedUrl(path, 2);
    assert.equal((await fetch(data!.signedUrl)).status, 200);
    await new Promise((r) => setTimeout(r, 3500));
    assert.notEqual((await fetch(data!.signedUrl)).status, 200, "signed URL still valid after expiry");
    await s.from("hug-photos").remove([path]);
  });

  test("buckets reject the wrong file types", async () => {
    const s = storage();
    const r = await s.from("hug-photos").upload(`${randomBytes(12).toString("base64url")}.jpg`, new Uint8Array([1, 2, 3]), { contentType: "text/html" });
    assert.ok(r.error, "bucket accepted text/html");
  });
});
