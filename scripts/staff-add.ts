// Creates a founder account (Supabase Auth user + app.staff row).
//   npm run staff:add -- founder@example.com
// LOCAL by default. For staging/production, run with that environment's
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY and STAFF_ADD_ALLOW_REMOTE=1.
// Prints a one-time temporary password; the founder enrolls TOTP on first sign-in.
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";

const email = (process.argv[2] ?? "").trim().toLowerCase();
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Usage: npm run staff:add -- founder@example.com");
const url = process.env.SUPABASE_URL!;
if (!/127\.0\.0\.1|localhost/.test(url) && process.env.STAFF_ADD_ALLOW_REMOTE !== "1") throw new Error("Refusing to touch a remote project without STAFF_ADD_ALLOW_REMOTE=1.");
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const password = `Wh-${randomBytes(12).toString("base64url")}9a`;
const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
if (error || !data.user) throw new Error(`Could not create user: ${error?.message}`);
const pg = await import("pg");
const c = new pg.default.Client({ connectionString: process.env.SEED_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres" });
await c.connect();
await c.query("insert into app.staff (user_id, email) values ($1, $2)", [data.user.id, email]);
await c.end();
console.log(`Founder account created for ${email}.\nTemporary password (shown once): ${password}\nThey'll set up an authenticator app on first sign-in at /studio.`);
