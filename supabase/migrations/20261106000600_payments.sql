-- Word Hug — M3 payments model (Stripe TEST mode only; live mode is refused in code).
--
-- Written hug ($1): paid BEFORE delivery. The customer's choices live in a
-- draft (not an order); the hug is created only when the payment is confirmed.
--
-- Founder video ($15): charged only AFTER a verified upload.
--   reserve  -> a short checkout hold on a slot (not an order, counts toward capacity)
--   booked   -> card saved via SetupIntent (customer-authenticated). This is the order.
--   start recording -> off-session authorization (manual capture) MUST succeed first
--   ready    -> verified upload; the server captures
--   released -> the video is visible only once the capture has succeeded

-- ---------- drafts for prepaid written hugs ----------
create table app.hug_drafts (
  id uuid primary key default gen_random_uuid(),
  owner_key_hash text not null check (owner_key_hash ~ '^[0-9a-f]{64}$'),
  input jsonb not null,
  photo_path text check (photo_path is null or photo_path ~ '^[A-Za-z0-9_-]+\.(jpg|png|webp)$'),
  photo_mime text,
  photo_bytes int,
  photo_allow_for_video boolean not null default false,
  checkout_session_id text unique,
  status text not null default 'pending' check (status in ('pending', 'paid', 'expired', 'canceled')),
  hug_id uuid references app.hugs(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '2 hours'
);
alter table app.hug_drafts enable row level security;
alter table app.hug_drafts force row level security;
revoke all on app.hug_drafts from public, anon, authenticated;
grant select, insert, update, delete on app.hug_drafts to wordhug_app;
create policy server_all on app.hug_drafts for all to wordhug_app using (true) with check (true);

-- ---------- payments: one row per hug purchase / per video order ----------
alter table app.payments drop constraint if exists demo_has_no_stripe_ids;
alter table app.payments drop constraint if exists status_matches_provider;
alter table app.payments
  add column if not exists draft_id uuid references app.hug_drafts(id) on delete set null,
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_payment_method_id text,
  add column if not exists stripe_setup_intent_id text unique,
  add column if not exists stripe_charge_id text,
  add column if not exists capture_before timestamptz,
  add column if not exists refunded_cents int not null default 0 check (refunded_cents >= 0),
  add column if not exists last_error text check (last_error is null or char_length(last_error) <= 300);
alter table app.payments add constraint no_live_or_demo_mix check (
  (provider = 'demo') = (status in ('demo_free', 'demo_authorized', 'demo_refunded'))
);
alter table app.payments add constraint refund_within_amount check (refunded_cents <= amount_cents);
create unique index one_payment_per_video_order on app.payments (video_order_id) where video_order_id is not null;
create unique index one_payment_per_draft on app.payments (draft_id) where draft_id is not null;

-- ---------- video orders ----------
alter table app.video_orders add column if not exists hold_kind text check (hold_kind in ('checkout', 'waitlist'));
alter table app.video_orders add column if not exists checkout_session_id text unique;
update app.video_orders set hold_kind = 'waitlist' where status = 'held' and hold_kind is null;
alter table app.video_orders add constraint held_has_kind check ((status = 'held') = (hold_kind is not null));

-- No more "book without paying". Orders are created by confirm_video_booking.
drop function if exists app.book_video(uuid, text, app.payment_status);
drop function if exists app.confirm_hold(uuid, app.payment_status);

-- Reserve the next available slot while the customer saves a card (30 minutes).
create or replace function app.reserve_video(p_hug_id uuid, p_note text)
returns table (order_id uuid, recording_day date, hold_expires_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare d date; oid uuid; exp timestamptz;
begin
  if not exists (select 1 from app.hugs where id = p_hug_id) then raise exception 'not_found' using errcode = 'WH006'; end if;
  perform 1 from app.hugs where id = p_hug_id for update;
  -- A fresh attempt replaces this hug's own unfinished checkout hold.
  update app.video_orders set status = 'canceled', hold_expires_at = null, hold_kind = null, canceled_by = 'system',
         canceled_reason = 'Checkout restarted', updated_at = now()
   where hug_id = p_hug_id and status = 'held' and hold_kind = 'checkout';
  if exists (select 1 from app.video_orders where hug_id = p_hug_id and status <> 'canceled' and status <> 'expired') then
    raise exception 'already_booked' using errcode = 'WH001';
  end if;
  perform app.expire_holds();
  d := app._lock_free_day();
  if d is null then raise exception 'no_capacity' using errcode = 'WH002'; end if;
  exp := least(now() + interval '35 minutes', app.hold_deadline(d));
  if exp < now() + interval '31 minutes' then raise exception 'no_capacity' using errcode = 'WH002'; end if;
  insert into app.video_orders (hug_id, recording_day, status, hold_kind, hold_expires_at, note)
  values (p_hug_id, d, 'held', 'checkout', exp, left(coalesce(p_note, ''), 400))
  returning id into oid;
  insert into app.video_status_events (order_id, status, actor) values (oid, 'held', 'customer');
  return query select oid, d, exp;
end $$;

-- The held slot this hug may pay for right now (checkout or waitlist hold).
create or replace function app.attach_checkout(p_order_id uuid, p_session_id text) returns void
language sql security definer set search_path = '' as $$
  update app.video_orders set checkout_session_id = p_session_id, updated_at = now()
   where id = p_order_id and status = 'held' and hold_expires_at > now()
$$;

-- The order exists only once a card is saved (customer-authenticated SetupIntent).
create or replace function app.confirm_video_booking(
  p_order_id uuid, p_provider app.payment_provider, p_customer text, p_payment_method text, p_setup_intent text
) returns text
language plpgsql security definer set search_path = '' as $$
declare o app.video_orders; amt int;
begin
  if p_provider = 'demo' then raise exception 'demo payments are no longer accepted'; end if;
  if coalesce(p_payment_method, '') = '' then raise exception 'payment method required'; end if;
  select * into o from app.video_orders where id = p_order_id for update;
  if not found then raise exception 'not_found' using errcode = 'WH006'; end if;
  if o.status <> 'held' then
    -- Idempotent replay of the same confirmation.
    if exists (select 1 from app.payments where video_order_id = o.id and stripe_payment_method_id = p_payment_method) then return 'duplicate'; end if;
    raise exception 'hold_expired' using errcode = 'WH007';
  end if;
  if o.hold_expires_at < now() then raise exception 'hold_expired' using errcode = 'WH007'; end if;
  update app.video_orders set status = 'booked', hold_expires_at = null, hold_kind = null, updated_at = now() where id = o.id;
  insert into app.video_status_events (order_id, status, actor) values (o.id, 'booked', 'customer');
  select amount_cents into amt from app.products where sku = 'hug_video';
  insert into app.payments (sku, hug_id, video_order_id, provider, amount_cents, status,
                            stripe_customer_id, stripe_payment_method_id, stripe_setup_intent_id)
  values ('hug_video', o.hug_id, o.id, p_provider, amt, 'method_saved', p_customer, p_payment_method, p_setup_intent);
  update app.video_waitlist set status = 'booked', updated_at = now() where held_order_id = o.id or (hug_id = o.hug_id and status in ('waiting','offered'));
  return 'booked';
end $$;

-- Recording may only start once $15 is authorized (manual capture, off-session).
create or replace function app.set_recording(p_order_id uuid, p_recording boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare o app.video_orders;
begin
  select * into o from app.video_orders where id = p_order_id for update;
  if not found then raise exception 'not_found' using errcode = 'WH006'; end if;
  if p_recording and o.status not in ('booked', 'ready') then raise exception 'bad_transition' using errcode = 'WH004'; end if;
  if not p_recording and o.status <> 'recording' then raise exception 'bad_transition' using errcode = 'WH004'; end if;
  if p_recording and o.status = 'booked' and not exists (
       select 1 from app.payments where video_order_id = o.id and status in ('authorized', 'captured')) then
    raise exception 'payment_not_authorized' using errcode = 'WH009';
  end if;
  update app.video_orders
     set status = case when p_recording then 'recording'::app.video_status else 'booked'::app.video_status end,
         video_path = case when o.status = 'ready' then null else video_path end,
         video_mime = case when o.status = 'ready' then null else video_mime end,
         video_bytes = case when o.status = 'ready' then null else video_bytes end,
         uploaded_at = case when o.status = 'ready' then null else uploaded_at end,
         video_expires_at = case when o.status = 'ready' then null else video_expires_at end,
         updated_at = now()
   where id = p_order_id;
  insert into app.video_status_events (order_id, status, actor)
  values (p_order_id, case when p_recording then 'recording'::app.video_status else 'booked'::app.video_status end, 'studio');
end $$;

-- Cancellation releases the slot; the app releases any Stripe authorization.
create or replace function app.cancel_video(p_order_id uuid, p_actor text, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare o app.video_orders;
begin
  if p_actor not in ('customer', 'studio', 'system') then raise exception 'bad actor'; end if;
  select * into o from app.video_orders where id = p_order_id for update;
  if not found then raise exception 'not_found' using errcode = 'WH006'; end if;
  if (p_actor = 'customer' and o.status not in ('held', 'booked'))
     or (o.status in ('ready', 'canceled', 'expired')) then
    raise exception 'bad_transition' using errcode = 'WH004';
  end if;
  update app.video_orders set status = 'canceled', hold_expires_at = null, hold_kind = null, canceled_by = p_actor,
         canceled_reason = left(coalesce(nullif(p_reason, ''), 'Cancelled'), 200), updated_at = now()
   where id = p_order_id;
  insert into app.video_status_events (order_id, status, actor) values (p_order_id, 'canceled', p_actor);
  update app.payments set status = 'canceled', updated_at = now()
   where video_order_id = p_order_id and status in ('method_saved', 'action_required', 'pending');
  -- 'authorized' rows are moved to 'canceled' by the app after Stripe confirms the release.
  perform app.offer_waitlist();
end $$;

-- Holds: expire both checkout and waitlist holds.
create or replace function app.expire_holds() returns int
language plpgsql security definer set search_path = '' as $$
declare n int := 0; r record;
begin
  for r in
    select id from app.video_orders where status = 'held' and hold_expires_at < now() for update skip locked
  loop
    update app.video_orders
       set status = 'canceled', hold_expires_at = null, hold_kind = null, canceled_by = 'system',
           canceled_reason = 'Held slot was not confirmed in time', updated_at = now()
     where id = r.id;
    insert into app.video_status_events (order_id, status, actor) values (r.id, 'canceled', 'system');
    update app.video_waitlist set status = 'expired', updated_at = now() where held_order_id = r.id and status = 'offered';
    n := n + 1;
  end loop;
  if n > 0 then perform app.offer_waitlist(); end if;
  return n;
end $$;

create or replace function app.offer_waitlist() returns int
language plpgsql security definer set search_path = '' as $$
declare w record; d date; oid uuid; n int := 0; deadline timestamptz;
begin
  for w in
    select id, hug_id, note from app.video_waitlist where status = 'waiting' order by created_at for update skip locked
  loop
    begin
      d := app._lock_free_day();
    exception when sqlstate 'WH003' then
      return n;
    end;
    exit when d is null;
    deadline := app.hold_deadline(d);
    exit when deadline < now() + interval '45 minutes';
    insert into app.video_orders (hug_id, recording_day, status, hold_kind, hold_expires_at, note)
    values (w.hug_id, d, 'held', 'waitlist', deadline, w.note)
    returning id into oid;
    insert into app.video_status_events (order_id, status, actor) values (oid, 'held', 'system');
    update app.video_waitlist set status = 'offered', held_order_id = oid, updated_at = now() where id = w.id;
    n := n + 1;
  end loop;
  return n;
end $$;

create or replace function app.leave_waitlist(p_hug_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare held uuid;
begin
  select held_order_id into held from app.video_waitlist where hug_id = p_hug_id and status in ('waiting', 'offered') for update;
  update app.video_waitlist set status = 'canceled', updated_at = now() where hug_id = p_hug_id and status in ('waiting', 'offered');
  if held is not null then
    update app.video_orders set status = 'canceled', hold_expires_at = null, hold_kind = null, canceled_by = 'customer',
           canceled_reason = 'Declined the held slot', updated_at = now()
     where id = held and status = 'held';
    insert into app.video_status_events (order_id, status, actor) values (held, 'canceled', 'customer');
    perform app.offer_waitlist();
  end if;
end $$;

create or replace function app.join_waitlist(p_hug_id uuid, p_note text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare wid uuid;
begin
  if not exists (select 1 from app.hugs where id = p_hug_id) then raise exception 'not_found' using errcode = 'WH006'; end if;
  if exists (select 1 from app.video_orders where hug_id = p_hug_id and status not in ('canceled', 'expired')) then
    raise exception 'already_booked' using errcode = 'WH001';
  end if;
  insert into app.video_waitlist (hug_id, note) values (p_hug_id, left(coalesce(p_note, ''), 400))
  on conflict do nothing returning id into wid;
  if wid is null then raise exception 'already_waitlisted' using errcode = 'WH008'; end if;
  return wid;
end $$;

-- Draft photos are referenced by drafts, not orphans.
create or replace function app.orphaned_objects(p_bucket text, p_older_than interval default interval '1 hour')
returns table (name text)
language sql stable security definer set search_path = '' as $$
  select o.name from storage.objects o
   where o.bucket_id = p_bucket and o.created_at < now() - p_older_than
     and case p_bucket
       when 'hug-photos' then not exists (select 1 from app.hug_photos p where p.storage_path = o.name)
                          and not exists (select 1 from app.hug_drafts d where d.photo_path = o.name and d.status = 'pending' and d.expires_at > now())
       when 'hug-videos' then not exists (select 1 from app.video_orders v where v.video_path = o.name)
       else false end
   limit 200
$$;

-- Lock down & grant.
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'app' loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to wordhug_app', f.sig);
  end loop;
end $$;
revoke execute on function app._lock_free_day() from wordhug_app;
revoke execute on function app.guard_video_ready() from wordhug_app;
