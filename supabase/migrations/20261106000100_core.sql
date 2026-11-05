-- Word Hug — M2 core schema.
--
-- Security model
--  * Everything lives in the private `app` schema, which is NOT exposed by
--    Supabase's REST/GraphQL APIs. The public anon/authenticated roles have no
--    privileges on it at all, and every table has RLS enabled and FORCED.
--  * The Next.js server connects as the least-privilege role `wordhug_app`
--    (no BYPASSRLS, no superuser, no access to auth/storage schemas). Its RLS
--    policies grant only what the server needs.
--  * Invariants (capacity, the "ready needs a real upload" rule, consent,
--    photo expiry, legal status transitions) are enforced in the database, so
--    an application bug cannot violate them.
--  * Owner keys and tokens are stored only as SHA-256 hashes.

create extension if not exists citext with schema extensions;

create schema if not exists app;
revoke all on schema app from public;
revoke all on schema app from anon, authenticated;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'wordhug_app') then
    -- NOLOGIN here; each environment enables login with its own secret password
    -- (local: supabase/seed.sql, production: run once by the operator).
    create role wordhug_app nologin noinherit nobypassrls;
  end if;
end $$;
grant usage on schema app to wordhug_app;
grant usage on schema extensions to wordhug_app;

-- ---------- enums ----------
create type app.hug_category as enum ('encourage', 'roast', 'flirt', 'laugh');
create type app.hug_tone as enum ('heartfelt', 'playful', 'poetic', 'deadpan');
create type app.hug_occasion as enum ('tough_week', 'big_day', 'new_start', 'birthday', 'heartbreak', 'win', 'missing');
-- held: a slot reserved for a waitlisted customer, awaiting their confirmation.
create type app.video_status as enum ('held', 'booked', 'recording', 'ready', 'canceled');
create type app.waitlist_status as enum ('waiting', 'offered', 'booked', 'canceled', 'expired');
create type app.payment_provider as enum ('demo', 'stripe');
create type app.payment_status as enum (
  'demo_free', 'demo_authorized', 'demo_refunded',               -- prototype only
  'pending', 'authorized', 'captured', 'refunded', 'canceled', 'failed' -- Stripe (future)
);

-- ---------- settings ----------
create table app.settings (
  id boolean primary key default true check (id),
  default_daily_capacity int not null default 5 check (default_daily_capacity between 0 and 50),
  booking_horizon_days int not null default 14 check (booking_horizon_days between 1 and 60),
  same_day_cutoff_hour int not null default 17 check (same_day_cutoff_hour between 0 and 24),
  timezone text not null default 'America/New_York',
  paused boolean not null default false,
  waitlist_hold_hours int not null default 24 check (waitlist_hold_hours between 1 and 168),
  updated_at timestamptz not null default now()
);
insert into app.settings default values;

-- ---------- customers & recovery ----------
create table app.customers (
  id uuid primary key default gen_random_uuid(),
  email extensions.citext unique check (email is null or (char_length(email) <= 254 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  email_verified_at timestamptz,
  stripe_customer_id text unique,
  created_at timestamptz not null default now()
);

create table app.recovery_tokens (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references app.customers(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  check (expires_at <= created_at + interval '1 hour')
);

-- ---------- hugs ----------
create table app.hugs (
  id uuid primary key default gen_random_uuid(),
  token text not null unique check (token ~ '^[A-Za-z0-9_-]{16,64}$'),    -- private gift-link capability
  owner_key_hash text not null check (owner_key_hash ~ '^[0-9a-f]{64}$'), -- sha256(owner key held on device)
  customer_id uuid references app.customers(id) on delete set null,       -- optional, for recovery
  for_self boolean not null,
  recipient_name text not null default '' check (char_length(recipient_name) <= 40),
  sender_name text not null default '' check (char_length(sender_name) <= 40),
  category app.hug_category not null,
  tone app.hug_tone not null,
  intensity smallint not null check (intensity between 1 and 3),
  occasion app.hug_occasion,
  interests text[] not null default '{}' check (cardinality(interests) <= 5),
  seed bigint not null,
  headline text not null check (char_length(headline) <= 120),
  kicker text not null check (char_length(kicker) <= 120),
  paragraphs text[] not null check (cardinality(paragraphs) between 1 and 8),
  line_ids text[] not null default '{}',
  revisions int not null default 0 check (revisions between 0 and 25),
  demo boolean not null default false,
  created_at timestamptz not null default now()
);
create index on app.hugs (customer_id);

-- Photos: bytes live in the PRIVATE storage bucket `hug-photos`.
create table app.hug_photos (
  hug_id uuid primary key references app.hugs(id) on delete cascade,
  storage_path text not null unique check (storage_path ~ '^[A-Za-z0-9_-]+\.(jpg|png|webp)$'),
  mime text not null check (mime in ('image/jpeg', 'image/png', 'image/webp')),
  bytes int not null check (bytes > 0 and bytes <= 8388608),
  consent_at timestamptz not null,
  consent_text text not null check (char_length(consent_text) >= 40),
  consent_version text not null check (char_length(consent_version) between 1 and 20),
  allow_for_video boolean not null default false,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  -- Photos may never be kept longer than 30 days after consent.
  check (expires_at > consent_at and expires_at <= consent_at + interval '30 days')
);
create index on app.hug_photos (expires_at);

-- ---------- recording days, video orders, waitlist ----------
create table app.recording_days (
  day date primary key,
  capacity int not null check (capacity between 0 and 50),
  closed boolean not null default false,
  created_at timestamptz not null default now()
);

create table app.video_orders (
  id uuid primary key default gen_random_uuid(),
  hug_id uuid not null references app.hugs(id) on delete cascade,
  recording_day date not null references app.recording_days(day),
  status app.video_status not null default 'booked',
  hold_expires_at timestamptz,
  note text not null default '' check (char_length(note) <= 400),
  video_path text unique check (video_path is null or video_path ~ '^[A-Za-z0-9_-]+\.(mp4|mov|webm)$'),
  video_mime text check (video_mime is null or video_mime in ('video/mp4', 'video/quicktime', 'video/webm')),
  video_bytes bigint check (video_bytes is null or video_bytes > 0),
  uploaded_at timestamptz,
  canceled_reason text check (canceled_reason is null or char_length(canceled_reason) <= 200),
  canceled_by text check (canceled_by is null or canceled_by in ('customer', 'studio', 'system')),
  demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- The honesty rule: no recorded file, no "ready". (A trigger also checks storage.)
  constraint ready_requires_upload check (
    status <> 'ready' or (video_path is not null and video_mime is not null and video_bytes is not null and uploaded_at is not null)
  ),
  constraint held_has_expiry check ((status = 'held') = (hold_expires_at is not null))
);
create unique index one_active_video_per_hug on app.video_orders (hug_id) where status <> 'canceled';
create index on app.video_orders (recording_day) where status <> 'canceled';

create table app.video_status_events (
  id bigserial primary key,
  order_id uuid not null references app.video_orders(id) on delete cascade,
  status app.video_status not null,
  actor text not null check (actor in ('customer', 'studio', 'system')),
  at timestamptz not null default now()
);

create table app.video_waitlist (
  id uuid primary key default gen_random_uuid(),
  hug_id uuid not null references app.hugs(id) on delete cascade,
  note text not null default '' check (char_length(note) <= 400),
  status app.waitlist_status not null default 'waiting',
  held_order_id uuid references app.video_orders(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index one_open_waitlist_per_hug on app.video_waitlist (hug_id) where status in ('waiting', 'offered');
create index on app.video_waitlist (created_at) where status = 'waiting';

-- ---------- commerce (prepared for Stripe, not enabled) ----------
create table app.products (
  sku text primary key,
  kind text not null check (kind in ('written', 'video', 'bundle', 'subscription')),
  name text not null,
  amount_cents int not null check (amount_cents >= 0),
  currency text not null default 'usd' check (currency = 'usd'),
  interval text check (interval in ('month')),
  credits_written int not null default 0,
  credits_video int not null default 0,
  stripe_price_id text unique,
  available boolean not null default false,
  deferred boolean not null default false
);
insert into app.products (sku, kind, name, amount_cents, available, deferred, credits_written, interval) values
  ('hug_written', 'written', 'Written Word Hug', 100, true, false, 0, null),
  ('hug_video', 'video', 'Founder Video Word Hug', 1500, true, false, 0, null),
  ('bundle_pocketful', 'bundle', 'A Pocketful', 800, false, true, 10, null),
  ('sub_weekly', 'subscription', 'Weekly Word Hug', 300, false, true, 0, 'month');

create table app.payments (
  id uuid primary key default gen_random_uuid(),
  sku text not null references app.products(sku),
  hug_id uuid references app.hugs(id) on delete set null,
  video_order_id uuid references app.video_orders(id) on delete set null,
  customer_id uuid references app.customers(id) on delete set null,
  provider app.payment_provider not null default 'demo',
  amount_cents int not null check (amount_cents >= 0),
  currency text not null default 'usd',
  status app.payment_status not null,
  idempotency_key text unique,
  stripe_checkout_session_id text unique,
  stripe_payment_intent_id text unique,       -- videos: manual capture, captured only after upload
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint demo_has_no_stripe_ids check (
    provider <> 'demo' or (stripe_checkout_session_id is null and stripe_payment_intent_id is null)
  ),
  constraint status_matches_provider check (
    (provider = 'demo') = (status in ('demo_free', 'demo_authorized', 'demo_refunded'))
  )
);
create index on app.payments (video_order_id);
create index on app.payments (hug_id);

-- Webhook idempotency for the future Stripe integration.
create table app.stripe_events (
  id text primary key check (id like 'evt_%'),
  type text not null,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

-- ---------- studio access & abuse controls ----------
create table app.studio_sessions (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  check (expires_at <= created_at + interval '12 hours')
);

create table app.rate_limits (
  key text not null,
  window_start timestamptz not null,
  hits int not null default 0,
  primary key (key, window_start)
);

-- ---------- privileges & RLS ----------
do $$
declare t text;
begin
  foreach t in array array[
    'settings','customers','recovery_tokens','hugs','hug_photos','recording_days','video_orders',
    'video_status_events','video_waitlist','products','payments','stripe_events','studio_sessions','rate_limits'
  ] loop
    execute format('alter table app.%I enable row level security', t);
    execute format('alter table app.%I force row level security', t);
    execute format('revoke all on app.%I from public, anon, authenticated', t);
  end loop;
end $$;

-- What the server role may do, table by table.
grant select on app.settings, app.products to wordhug_app;
grant update (default_daily_capacity, paused, updated_at) on app.settings to wordhug_app;
grant select, insert, update on app.customers to wordhug_app;
grant select, insert, update on app.recovery_tokens to wordhug_app;
grant select, insert, update, delete on app.hugs to wordhug_app;
grant select, insert, delete on app.hug_photos to wordhug_app;
grant update (allow_for_video) on app.hug_photos to wordhug_app;
grant select, update (capacity, closed) on app.recording_days to wordhug_app;
grant select on app.video_orders, app.video_status_events, app.video_waitlist to wordhug_app;
grant update (note) on app.video_orders to wordhug_app;
grant select, insert, update on app.payments to wordhug_app;
grant select, insert, update on app.stripe_events to wordhug_app;
grant select, insert, update on app.studio_sessions to wordhug_app;
grant select, insert, update, delete on app.rate_limits to wordhug_app;
grant usage on sequence app.video_status_events_id_seq to wordhug_app;
-- Note: inserting/updating video orders, waitlist entries and recording days
-- happens ONLY through the SECURITY DEFINER functions in the next migration.

create policy server_all on app.settings for all to wordhug_app using (true) with check (true);
create policy server_all on app.products for select to wordhug_app using (true);
create policy server_all on app.customers for all to wordhug_app using (true) with check (true);
create policy server_all on app.recovery_tokens for all to wordhug_app using (true) with check (true);
create policy server_all on app.hugs for all to wordhug_app using (true) with check (true);
-- Expired photos are invisible to the server role even before the purge job runs.
create policy server_live_photos on app.hug_photos for select to wordhug_app using (expires_at > now());
create policy server_insert_photos on app.hug_photos for insert to wordhug_app with check (expires_at > now());
create policy server_update_photos on app.hug_photos for update to wordhug_app using (expires_at > now());
create policy server_delete_photos on app.hug_photos for delete to wordhug_app using (true);
create policy server_all on app.recording_days for all to wordhug_app using (true) with check (true);
create policy server_all on app.video_orders for all to wordhug_app using (true) with check (true);
create policy server_all on app.video_status_events for select to wordhug_app using (true);
create policy server_all on app.video_waitlist for select to wordhug_app using (true);
create policy server_all on app.payments for all to wordhug_app using (true) with check (true);
create policy server_all on app.stripe_events for all to wordhug_app using (true) with check (true);
create policy server_all on app.studio_sessions for all to wordhug_app using (true) with check (true);
create policy server_all on app.rate_limits for all to wordhug_app using (true) with check (true);
