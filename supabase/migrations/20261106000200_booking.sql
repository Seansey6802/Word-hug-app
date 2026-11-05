-- Word Hug — M2 booking engine, video lifecycle and waitlist.
-- All writes to video orders / waitlist / recording days go through these
-- SECURITY DEFINER functions. They take row locks on recording_days so that
-- concurrent bookings can never exceed a day's capacity.

-- Custom SQLSTATEs (class WH) so the app can map errors precisely.
--   WH001 already_booked   WH002 no_capacity   WH003 paused
--   WH004 bad_transition   WH005 upload_missing WH006 not_found
--   WH007 hold_expired     WH008 already_waitlisted

create or replace function app.studio_today() returns date
language sql stable security definer set search_path = '' as $$
  select (now() at time zone s.timezone)::date from app.settings s
$$;

create or replace function app.first_bookable_day() returns date
language sql stable security definer set search_path = '' as $$
  select case
    when extract(hour from (now() at time zone s.timezone)) >= s.same_day_cutoff_hour
      then app.studio_today() + 1
    else app.studio_today()
  end
  from app.settings s
$$;

create or replace function app.active_count(p_day date) returns int
language sql stable security definer set search_path = '' as $$
  select count(*)::int from app.video_orders
  where recording_day = p_day and status in ('held', 'booked', 'recording', 'ready')
$$;

-- Release holds whose confirmation window has passed, and hand the slot on.
create or replace function app.expire_holds() returns int
language plpgsql security definer set search_path = '' as $$
declare n int := 0; r record;
begin
  for r in
    select id from app.video_orders where status = 'held' and hold_expires_at < now() for update skip locked
  loop
    update app.video_orders
       set status = 'canceled', hold_expires_at = null, canceled_by = 'system',
           canceled_reason = 'Held slot was not confirmed in time', updated_at = now()
     where id = r.id;
    insert into app.video_status_events (order_id, status, actor) values (r.id, 'canceled', 'system');
    update app.video_waitlist set status = 'expired', updated_at = now() where held_order_id = r.id and status = 'offered';
    n := n + 1;
  end loop;
  if n > 0 then perform app.offer_waitlist(); end if;
  return n;
end $$;

-- Internal: lock and return the first day with a free slot, or null.
create or replace function app._lock_free_day() returns date
language plpgsql security definer set search_path = '' as $$
declare
  s app.settings;
  d date;
  cap int;
  is_closed boolean;
begin
  select * into s from app.settings;
  if s.paused then raise exception 'paused' using errcode = 'WH003'; end if;
  d := app.first_bookable_day();
  for i in 0 .. s.booking_horizon_days - 1 loop
    insert into app.recording_days (day, capacity) values (d + i, s.default_daily_capacity) on conflict (day) do nothing;
    -- Row lock serialises every booking for this day.
    select capacity, closed into cap, is_closed from app.recording_days where day = d + i for update;
    if not is_closed and app.active_count(d + i) < cap then
      return d + i;
    end if;
  end loop;
  return null;
end $$;

-- Book the next available recording day for a hug.
create or replace function app.book_video(p_hug_id uuid, p_note text, p_payment_status app.payment_status default 'demo_authorized')
returns table (order_id uuid, recording_day date)
language plpgsql security definer set search_path = '' as $$
declare
  d date;
  oid uuid;
  amt int;
begin
  if not exists (select 1 from app.hugs where id = p_hug_id) then
    raise exception 'not_found' using errcode = 'WH006';
  end if;
  -- Serialise per hug as well, so double-taps can't create two orders.
  perform 1 from app.hugs where id = p_hug_id for update;
  if exists (select 1 from app.video_orders where hug_id = p_hug_id and status <> 'canceled') then
    raise exception 'already_booked' using errcode = 'WH001';
  end if;
  perform app.expire_holds();
  d := app._lock_free_day();
  if d is null then raise exception 'no_capacity' using errcode = 'WH002'; end if;

  insert into app.video_orders (hug_id, recording_day, status, note)
  values (p_hug_id, d, 'booked', left(coalesce(p_note, ''), 400))
  returning id into oid;
  insert into app.video_status_events (order_id, status, actor) values (oid, 'booked', 'customer');

  select amount_cents into amt from app.products where sku = 'hug_video';
  insert into app.payments (sku, hug_id, video_order_id, provider, amount_cents, status)
  values ('hug_video', p_hug_id, oid, 'demo', amt, p_payment_status);

  -- Joining from the waitlist? Close that entry.
  update app.video_waitlist set status = 'booked', updated_at = now()
   where hug_id = p_hug_id and status in ('waiting', 'offered');

  return query select oid, d;
end $$;

-- What the customer sees before booking (no locks).
create or replace function app.next_available_day()
returns table (day date, remaining int)
language plpgsql stable security definer set search_path = '' as $$
declare s app.settings; d date; cap int; is_closed boolean; used int;
begin
  select * into s from app.settings;
  if s.paused then return; end if;
  d := app.first_bookable_day();
  for i in 0 .. s.booking_horizon_days - 1 loop
    select rd.capacity, rd.closed into cap, is_closed from app.recording_days rd where rd.day = d + i;
    if not found then cap := s.default_daily_capacity; is_closed := false; end if;
    used := app.active_count(d + i);
    if not is_closed and used < cap then
      return query select d + i, cap - used;
      return;
    end if;
  end loop;
end $$;

-- No-charge waitlist.
create or replace function app.join_waitlist(p_hug_id uuid, p_note text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare wid uuid;
begin
  if not exists (select 1 from app.hugs where id = p_hug_id) then raise exception 'not_found' using errcode = 'WH006'; end if;
  if exists (select 1 from app.video_orders where hug_id = p_hug_id and status <> 'canceled') then
    raise exception 'already_booked' using errcode = 'WH001';
  end if;
  insert into app.video_waitlist (hug_id, note) values (p_hug_id, left(coalesce(p_note, ''), 400))
  on conflict do nothing returning id into wid;
  if wid is null then raise exception 'already_waitlisted' using errcode = 'WH008'; end if;
  return wid;
end $$;

create or replace function app.leave_waitlist(p_hug_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare held uuid;
begin
  select held_order_id into held from app.video_waitlist where hug_id = p_hug_id and status in ('waiting', 'offered') for update;
  update app.video_waitlist set status = 'canceled', updated_at = now() where hug_id = p_hug_id and status in ('waiting', 'offered');
  if held is not null then
    update app.video_orders set status = 'canceled', hold_expires_at = null, canceled_by = 'customer',
           canceled_reason = 'Declined the held slot', updated_at = now()
     where id = held and status = 'held';
    insert into app.video_status_events (order_id, status, actor) values (held, 'canceled', 'customer');
    perform app.offer_waitlist();
  end if;
end $$;

-- Offer any free slots to the oldest waiting customers by placing a timed hold.
create or replace function app.offer_waitlist() returns int
language plpgsql security definer set search_path = '' as $$
declare w record; d date; oid uuid; n int := 0; hours int;
begin
  select waitlist_hold_hours into hours from app.settings;
  for w in
    select id, hug_id, note from app.video_waitlist where status = 'waiting' order by created_at for update skip locked
  loop
    begin
      d := app._lock_free_day();
    exception when sqlstate 'WH003' then
      return n; -- paused
    end;
    exit when d is null;
    insert into app.video_orders (hug_id, recording_day, status, hold_expires_at, note)
    values (w.hug_id, d, 'held', now() + make_interval(hours => hours), w.note)
    returning id into oid;
    insert into app.video_status_events (order_id, status, actor) values (oid, 'held', 'system');
    update app.video_waitlist set status = 'offered', held_order_id = oid, updated_at = now() where id = w.id;
    n := n + 1;
  end loop;
  return n;
end $$;

-- Customer confirms a held slot (this is where payment will be authorized).
create or replace function app.confirm_hold(p_hug_id uuid, p_payment_status app.payment_status default 'demo_authorized')
returns table (order_id uuid, recording_day date)
language plpgsql security definer set search_path = '' as $$
declare o app.video_orders; amt int;
begin
  select * into o from app.video_orders where hug_id = p_hug_id and status = 'held' for update;
  if not found then raise exception 'not_found' using errcode = 'WH006'; end if;
  if o.hold_expires_at < now() then raise exception 'hold_expired' using errcode = 'WH007'; end if;
  update app.video_orders set status = 'booked', hold_expires_at = null, updated_at = now() where id = o.id;
  insert into app.video_status_events (order_id, status, actor) values (o.id, 'booked', 'customer');
  select amount_cents into amt from app.products where sku = 'hug_video';
  insert into app.payments (sku, hug_id, video_order_id, provider, amount_cents, status)
  values ('hug_video', p_hug_id, o.id, 'demo', amt, p_payment_status);
  update app.video_waitlist set status = 'booked', updated_at = now() where held_order_id = o.id;
  return query select o.id, o.recording_day;
end $$;

-- Cancel (customer: only before recording starts; studio: any time before ready).
create or replace function app.cancel_video(p_order_id uuid, p_actor text, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare o app.video_orders;
begin
  if p_actor not in ('customer', 'studio', 'system') then raise exception 'bad actor'; end if;
  select * into o from app.video_orders where id = p_order_id for update;
  if not found then raise exception 'not_found' using errcode = 'WH006'; end if;
  if (p_actor = 'customer' and o.status not in ('held', 'booked'))
     or (o.status in ('ready', 'canceled')) then
    raise exception 'bad_transition' using errcode = 'WH004';
  end if;
  update app.video_orders set status = 'canceled', hold_expires_at = null, canceled_by = p_actor,
         canceled_reason = left(coalesce(nullif(p_reason, ''), 'Cancelled'), 200), updated_at = now()
   where id = p_order_id;
  insert into app.video_status_events (order_id, status, actor) values (p_order_id, 'canceled', p_actor);
  -- Release any reservation. (Stripe later: cancel the uncaptured PaymentIntent.)
  update app.payments set status = 'demo_refunded', updated_at = now()
   where video_order_id = p_order_id and provider = 'demo' and status = 'demo_authorized';
  perform app.offer_waitlist();
end $$;

-- Studio moves between booked and recording.
create or replace function app.set_recording(p_order_id uuid, p_recording boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare o app.video_orders;
begin
  select * into o from app.video_orders where id = p_order_id for update;
  if not found then raise exception 'not_found' using errcode = 'WH006'; end if;
  if p_recording and o.status not in ('booked', 'ready') then raise exception 'bad_transition' using errcode = 'WH004'; end if;
  if not p_recording and o.status <> 'recording' then raise exception 'bad_transition' using errcode = 'WH004'; end if;
  update app.video_orders
     set status = case when p_recording then 'recording'::app.video_status else 'booked'::app.video_status end,
         -- Re-recording a ready video clears the upload; the app deletes the old object.
         video_path = case when o.status = 'ready' then null else video_path end,
         video_mime = case when o.status = 'ready' then null else video_mime end,
         video_bytes = case when o.status = 'ready' then null else video_bytes end,
         uploaded_at = case when o.status = 'ready' then null else uploaded_at end,
         updated_at = now()
   where id = p_order_id;
  insert into app.video_status_events (order_id, status, actor)
  values (p_order_id, case when p_recording then 'recording'::app.video_status else 'booked'::app.video_status end, 'studio');
end $$;

-- The ONLY way to reach "ready": a recording that physically exists in the
-- private videos bucket, with a matching size and type.
create or replace function app.mark_video_ready(p_order_id uuid, p_path text) returns void
language plpgsql security definer set search_path = '' as $$
declare o app.video_orders; obj record;
begin
  select * into o from app.video_orders where id = p_order_id for update;
  if not found then raise exception 'not_found' using errcode = 'WH006'; end if;
  if o.status <> 'recording' then raise exception 'bad_transition' using errcode = 'WH004'; end if;
  select (metadata->>'size')::bigint as size, metadata->>'mimetype' as mime into obj
    from storage.objects where bucket_id = 'hug-videos' and name = p_path;
  if not found or obj.size is null or obj.size < 10240 then
    raise exception 'upload_missing' using errcode = 'WH005';
  end if;
  update app.video_orders
     set status = 'ready', video_path = p_path, video_bytes = obj.size,
         video_mime = coalesce(obj.mime, 'video/mp4'), uploaded_at = now(), updated_at = now()
   where id = p_order_id;
  insert into app.video_status_events (order_id, status, actor) values (p_order_id, 'ready', 'studio');
end $$;

-- Belt and braces: even a superuser UPDATE cannot set "ready" without a real object.
create or replace function app.guard_video_ready() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'ready' and (old.status is distinct from 'ready' or new.video_path is distinct from old.video_path) then
    if not exists (select 1 from storage.objects where bucket_id = 'hug-videos' and name = new.video_path) then
      raise exception 'upload_missing' using errcode = 'WH005';
    end if;
  end if;
  return new;
end $$;
create trigger video_ready_requires_object
  before insert or update on app.video_orders
  for each row execute function app.guard_video_ready();

-- Studio founder access to a photo: only with the customer's explicit permission
-- and only while the photo is within its 30-day life.
create or replace function app.studio_photo_path(p_order_id uuid) returns text
language sql stable security definer set search_path = '' as $$
  select p.storage_path
    from app.video_orders o join app.hug_photos p on p.hug_id = o.hug_id
   where o.id = p_order_id and p.allow_for_video and p.expires_at > now()
$$;

-- Photo lifecycle: list expired photos so the app can delete objects via the
-- Storage API first, then remove the row (never orphaning a file).
create or replace function app.expired_photo_paths(p_limit int default 100)
returns table (hug_id uuid, storage_path text)
language sql stable security definer set search_path = '' as $$
  select hug_id, storage_path from app.hug_photos where expires_at <= now() order by expires_at limit p_limit
$$;

create or replace function app.forget_expired_photo(p_hug_id uuid) returns void
language sql security definer set search_path = '' as $$
  delete from app.hug_photos where hug_id = p_hug_id and expires_at <= now()
$$;

-- Objects in private buckets that no row references (e.g. a crash mid-upload).
create or replace function app.orphaned_objects(p_bucket text, p_older_than interval default interval '1 hour')
returns table (name text)
language sql stable security definer set search_path = '' as $$
  select o.name from storage.objects o
   where o.bucket_id = p_bucket and o.created_at < now() - p_older_than
     and case p_bucket
       when 'hug-photos' then not exists (select 1 from app.hug_photos p where p.storage_path = o.name)
       when 'hug-videos' then not exists (select 1 from app.video_orders v where v.video_path = o.name)
       else false end
   limit 200
$$;

-- Simple fixed-window rate limiter usable from the app.
create or replace function app.hit_rate_limit(p_key text, p_limit int, p_window_seconds int) returns boolean
language plpgsql security definer set search_path = '' as $$
declare ws timestamptz; n int;
begin
  ws := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  insert into app.rate_limits (key, window_start, hits) values (p_key, ws, 1)
  on conflict (key, window_start) do update set hits = app.rate_limits.hits + 1
  returning hits into n;
  delete from app.rate_limits where window_start < now() - interval '1 day';
  return n <= p_limit;
end $$;

-- Lock functions down: owner-only by default, then grant to the server role.
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'app' loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to wordhug_app', f.sig);
  end loop;
end $$;
-- The internal lock helper and the trigger are not for direct use.
revoke execute on function app._lock_free_day() from wordhug_app;
revoke execute on function app.guard_video_ready() from wordhug_app;
