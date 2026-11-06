// Shared helpers for tests that run against the LOCAL Supabase stack
// (`npm run db:start`). They refuse to touch anything that isn't localhost.
import pg from "pg";
import { createHash, randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

export const ADMIN_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
export const APP_URL = process.env.DATABASE_URL ?? "postgresql://wordhug_app:wordhug-local-dev-only@127.0.0.1:54322/postgres";
for (const u of [ADMIN_URL, APP_URL]) if (!/127\.0\.0\.1|localhost/.test(u)) throw new Error("Tests only run against local databases.");

export const admin = () => new pg.Pool({ connectionString: ADMIN_URL, max: 4 });
export const appPool = (max = 25) => new pg.Pool({ connectionString: APP_URL, max });

export const storage = () =>
  createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } }).storage;

export const PUBLISHABLE = "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH"; // local default anon key

export const APP_TABLES = [
  "settings", "customers", "recovery_tokens", "hugs", "hug_photos", "recording_days", "video_orders",
  "video_status_events", "video_waitlist", "products", "payments", "stripe_events", "studio_sessions", "rate_limits",
  "staff", "hug_drafts",
];

/** Beta defaults (mirror the migrations). */
export async function restoreDefaults(a: pg.Pool) {
  await a.query(`update app.settings set default_daily_capacity = 5, booking_horizon_days = 7, same_day_cutoff_hour = 17,
                   paused = false, waitlist_hold_hours = 24, timezone = 'America/Denver',
                   recording_weekdays = '{1,2,3,4,5}', video_retention_days = 30`);
}

/** Wipe customer data. Every weekday enabled and same-day allowed so tests don't depend on the clock. */
export async function resetData(a: pg.Pool) {
  await a.query(`truncate app.hugs, app.customers, app.recording_days, app.studio_sessions, app.rate_limits, app.stripe_events cascade`);
  await a.query(`update app.settings set default_daily_capacity = 5, booking_horizon_days = 7, same_day_cutoff_hour = 24,
                   paused = false, waitlist_hold_hours = 24, timezone = 'America/Denver',
                   recording_weekdays = '{1,2,3,4,5,6,7}', video_retention_days = 30`);
}

export async function makeHug(a: pg.Pool, n = 1) {
  const ids: string[] = [];
  for (let i = 0; i < n; i++) {
    const { rows } = await a.query(
      `insert into app.hugs (token, owner_key_hash, for_self, category, tone, intensity, seed, headline, kicker, paragraphs)
       values ($1, $2, true, 'encourage', 'heartfelt', 2, 1, 'A Word Hug, just for you', 'Encouragement', array['Hello.'])
       returning id`,
      [randomBytes(16).toString("base64url"), createHash("sha256").update(randomBytes(8)).digest("hex")],
    );
    ids.push(rows[0].id);
  }
  return ids;
}

export async function sqlState(p: Promise<unknown>) {
  try {
    await p;
    return "ok";
  } catch (e) {
    return (e as { code?: string }).code ?? "error";
  }
}

/** Book like the app does: reserve a slot, then confirm once a card is saved (fake gateway ids). */
export const BOOK_SQL = `select app.confirm_video_booking(r.order_id, 'fake', 'cus_test', 'pm_fake_ok', 'seti_test_' || r.order_id) as ok
                           from app.reserve_video($1, '') r`;
/** What the app records after a successful off-session $15 authorization. */
export const AUTHORIZE_SQL = `update app.payments set status = 'authorized', stripe_payment_intent_id = 'pi_test_' || video_order_id
                               where video_order_id = $1 and status = 'method_saved'`;
