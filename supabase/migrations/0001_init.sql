-- Word Hug — initial schema (NOT applied during the prototype).
-- Mirrors lib/types.ts. All access goes through the server with the service
-- role; RLS is enabled with no public policies, so the anon key can read nothing.

create extension if not exists pgcrypto;

create type hug_category as enum ('encourage', 'roast', 'flirt', 'laugh');
create type hug_tone as enum ('heartfelt', 'playful', 'poetic', 'deadpan');
create type video_status as enum ('queued', 'recording', 'ready', 'canceled');
create type payment_status as enum ('pending', 'free', 'authorized', 'captured', 'refunded', 'failed');

create table customers (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  stripe_customer_id text unique,
  created_at timestamptz not null default now()
);

create table hugs (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,               -- private gift-link capability (128-bit random)
  owner_key_hash text not null,             -- sha256 of the owner key held on the creator's device
  customer_id uuid references customers(id) on delete set null,
  for_self boolean not null,
  recipient_name text not null default '' check (char_length(recipient_name) <= 40),
  sender_name text not null default '' check (char_length(sender_name) <= 40),
  category hug_category not null,
  tone hug_tone not null,
  intensity smallint not null check (intensity between 1 and 3),
  occasion text,
  interests text[] not null default '{}',
  seed bigint not null,
  headline text not null,
  kicker text not null,
  paragraphs text[] not null,
  line_ids text[] not null default '{}',
  revisions int not null default 0,
  created_at timestamptz not null default now()
);

-- Photos live in a PRIVATE storage bucket; this row only records consent + location.
create table hug_photos (
  hug_id uuid primary key references hugs(id) on delete cascade,
  storage_path text not null,               -- bucket: hug-photos (private)
  mime text not null,
  bytes int not null,
  consent_at timestamptz not null,
  consent_text text not null,
  allow_for_video boolean not null default false,
  expires_at timestamptz not null           -- purge job deletes object + row after this
);

create table video_orders (
  id uuid primary key default gen_random_uuid(),
  hug_id uuid not null references hugs(id) on delete cascade,
  status video_status not null default 'queued',
  note text not null default '' check (char_length(note) <= 400),
  video_path text,                          -- bucket: hug-videos (private)
  video_uploaded_at timestamptz,
  canceled_reason text,
  created_at timestamptz not null default now(),
  -- The honesty rule, enforced by the database too: no file, no "ready".
  constraint ready_requires_upload check (status <> 'ready' or (video_path is not null and video_uploaded_at is not null))
);
create unique index one_open_video_per_hug on video_orders (hug_id) where status <> 'canceled';

create table video_status_events (
  id bigserial primary key,
  order_id uuid not null references video_orders(id) on delete cascade,
  status video_status not null,
  at timestamptz not null default now()
);

create table studio_settings (
  id boolean primary key default true check (id),
  daily_capacity int not null default 8 check (daily_capacity between 0 and 50),
  paused boolean not null default false,
  timezone text not null default 'America/New_York'
);
insert into studio_settings default values;

-- Commerce (Stripe): products map to Stripe Prices; payments track intents.
create table products (
  sku text primary key,
  kind text not null check (kind in ('written', 'video', 'bundle', 'subscription')),
  name text not null,
  amount_cents int not null,
  interval text check (interval in ('month')),
  credits_written int not null default 0,
  credits_video int not null default 0,
  stripe_price_id text,
  available boolean not null default false
);

create table payments (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references customers(id) on delete set null,
  sku text not null references products(sku),
  hug_id uuid references hugs(id) on delete set null,
  video_order_id uuid references video_orders(id) on delete set null,
  amount_cents int not null,
  status payment_status not null default 'pending',
  stripe_checkout_session_id text unique,
  stripe_payment_intent_id text unique,     -- videos: manual capture, captured only after upload
  created_at timestamptz not null default now()
);

create table credit_balances (
  customer_id uuid primary key references customers(id) on delete cascade,
  written int not null default 0,
  video int not null default 0
);

create table subscriptions (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  sku text not null references products(sku),
  stripe_subscription_id text unique,
  status text not null,
  current_period_end timestamptz,
  created_at timestamptz not null default now()
);

alter table customers enable row level security;
alter table hugs enable row level security;
alter table hug_photos enable row level security;
alter table video_orders enable row level security;
alter table video_status_events enable row level security;
alter table studio_settings enable row level security;
alter table products enable row level security;
alter table payments enable row level security;
alter table credit_balances enable row level security;
alter table subscriptions enable row level security;

-- Private buckets (no public URLs; serve via short-lived signed URLs only).
insert into storage.buckets (id, name, public) values ('hug-photos', 'hug-photos', false) on conflict do nothing;
insert into storage.buckets (id, name, public) values ('hug-videos', 'hug-videos', false) on conflict do nothing;
