// Test helpers: real Supabase Auth founder accounts with TOTP, against the LOCAL stack.
import { createHmac, randomBytes } from "node:crypto";
import pg from "pg";

const SB = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
export const PUBLISHABLE = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH";
if (!/127\.0\.0\.1|localhost/.test(SB)) throw new Error("Founder helpers only run against local Supabase.");

/** RFC 6238 TOTP (SHA-1, 30 s, 6 digits) — what an authenticator app shows. */
export function totp(base32: string, at = Date.now()) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const ch of base32.replace(/=+$/, "").toUpperCase()) bits += alphabet.indexOf(ch).toString(2).padStart(5, "0");
  const key = Buffer.from(bits.match(/.{8}/g)!.map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 1000 / 30)));
  const h = createHmac("sha1", key).update(counter).digest();
  const o = h[h.length - 1] & 0xf;
  return String(((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000)).padStart(6, "0");
}

async function auth(path: string, init: RequestInit & { token?: string } = {}) {
  const r = await fetch(`${SB}/auth/v1${path}`, {
    ...init,
    headers: { apikey: PUBLISHABLE, "content-type": "application/json", ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}), ...(init.headers ?? {}) },
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(`${path} → ${r.status} ${JSON.stringify(body)}`), { status: r.status, body });
  return body;
}

export async function createUser(staff: boolean) {
  const email = `founder-${randomBytes(4).toString("hex")}@example.com`;
  const password = `Test-${randomBytes(9).toString("base64url")}9a`;
  const r = await fetch(`${SB}/auth/v1/admin/users`, {
    method: "POST",
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "content-type": "application/json" },
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  const u = await r.json();
  if (!r.ok) throw new Error(JSON.stringify(u));
  if (staff) {
    const c = new pg.Client({ connectionString: "postgresql://postgres:postgres@127.0.0.1:54322/postgres" });
    await c.connect();
    await c.query("insert into app.staff (user_id, email) values ($1, $2)", [u.id, email]);
    await c.end();
  }
  return { id: u.id as string, email, password };
}

export const passwordToken = async (email: string, password: string) =>
  (await auth("/token?grant_type=password", { method: "POST", body: JSON.stringify({ email, password }) })).access_token as string;

/** Enrolls TOTP and returns an AAL2 access token plus the secret (to make more codes). */
export async function aal2Token(email: string, password: string) {
  const t1 = await passwordToken(email, password);
  const f = await auth("/factors", { method: "POST", token: t1, body: JSON.stringify({ factor_type: "totp", friendly_name: `t${Date.now()}` }) });
  const ch = await auth(`/factors/${f.id}/challenge`, { method: "POST", token: t1, body: "{}" });
  const v = await auth(`/factors/${f.id}/verify`, { method: "POST", token: t1, body: JSON.stringify({ challenge_id: ch.id, code: totp(f.totp.secret) }) });
  return { token: v.access_token as string, secret: f.totp.secret as string, factorId: f.id as string, aal1: t1 };
}

/** A founder (staff + MFA) signed into the studio: returns the studio cookie. */
export async function founderCookie(base: string, ip: string) {
  const u = await createUser(true);
  const { token } = await aal2Token(u.email, u.password);
  const r = await fetch(`${base}/api/studio/session`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify({ accessToken: token }),
  });
  if (r.status !== 200) throw new Error(`studio session ${r.status} ${await r.text()}`);
  return { cookie: r.headers.get("set-cookie")!.split(";")[0], user: u };
}

export async function signUpAttempt() {
  const r = await fetch(`${SB}/auth/v1/signup`, {
    method: "POST",
    headers: { apikey: PUBLISHABLE, "content-type": "application/json" },
    body: JSON.stringify({ email: `walkin-${randomBytes(3).toString("hex")}@example.com`, password: "Walkin-Password-123" }),
  });
  return r.status;
}
