-- Word Hug — M3 beta studio rules.
--   * America/Denver, 5 videos per ENABLED recording day, 7-day booking window,
--     configurable 5 p.m. same-day cutoff.
--   * Waitlist holds last at most 24 hours, and never past the held day's cutoff.
--   * Delivered videos are available for 30 days, then the file is deleted.

alter table app.settings
  add column if not exists recording_weekdays int[] not null default '{1,2,3,4,5}'
    check (recording_weekdays <@ '{1,2,3,4,5,6,7}'::int[]),          -- ISO: 1 = Monday … 7 = Sunday
  add column if not exists video_retention_days int not null default 30
    check (video_retention_days between 1 and 365);

alter table app.settings drop constraint if exists settings_waitlist_hold_hours_check;
alter table app.settings add constraint settings_waitlist_hold_hours_check check (waitlist_hold_hours between 1 and 24);

update app.settings set
  timezone = 'America/Denver',
  default_daily_capacity = 5,
  booking_horizon_days = 7,
  same_day_cutoff_hour = 17,
  waitlist_hold_hours = 24,
  recording_weekdays = '{1,2,3,4,5}',
  video_retention_days = 30;

alter table app.settings alter column timezone set default 'America/Denver';
alter table app.settings alter column booking_horizon_days set default 7;

grant update (same_day_cutoff_hour, recording_weekdays, waitlist_hold_hours) on app.settings to wordhug_app;

alter table app.video_orders
  add column if not exists video_expires_at timestamptz,
  add column if not exists video_duration_seconds numeric(6,1) check (video_duration_seconds is null or video_duration_seconds between 0 and 600),
  add column if not exists video_deleted_at timestamptz;
-- "expired" means the file was removed after its availability window.
alter table app.video_orders add constraint expired_has_no_file check (status <> 'expired' or (video_path is null and video_deleted_at is not null));
alter table app.video_orders add constraint ready_has_expiry check (status <> 'ready' or video_expires_at is not null);

create or replace function app.active_count(p_day date) returns int
language sql stable security definer set search_path = '' as $$
  select count(*)::int from app.video_orders
  where recording_day = p_day and status in ('held', 'booked', 'recording', 'ready', 'expired')
$$;

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
  -- Window counts calendar days from today (studio time), so a 7-day window
  -- never books further than today + 6, whatever the cutoff.
  for i in 0 .. (app.studio_today() + s.booking_horizon_days - 1) - d loop
    continue when extract(isodow from d + i)::int <> all (s.recording_weekdays);
    insert into app.recording_days (day, capacity) values (d + i, s.default_daily_capacity) on conflict (day) do nothing;
    select capacity, closed into cap, is_closed from app.recording_days where day = d + i for update;
    if not is_closed and app.active_count(d + i) < cap then
      return d + i;
    end if;
  end loop;
  return null;
end $$;

create or replace function app.next_available_day()
returns table (day date, remaining int)
language plpgsql stable security definer set search_path = '' as $$
declare s app.settings; d date; cap int; is_closed boolean; used int;
begin
  select * into s from app.settings;
  if s.paused then return; end if;
  d := app.first_bookable_day();
  for i in 0 .. (app.studio_today() + s.booking_horizon_days - 1) - d loop
    continue when extract(isodow from d + i)::int <> all (s.recording_weekdays);
    select rd.capacity, rd.closed into cap, is_closed from app.recording_days rd where rd.day = d + i;
    if not found then cap := s.default_daily_capacity; is_closed := false; end if;
    used := app.active_count(d + i);
    if not is_closed and used < cap then
      return query select d + i, cap - used;
      return;
    end if;
  end loop;
end $$;

-- A hold ends after waitlist_hold_hours, or at the held day's cutoff if that is sooner.
create or replace function app.hold_deadline(p_day date) returns timestamptz
language sql stable security definer set search_path = '' as $$
  select least(
    now() + make_interval(hours => s.waitlist_hold_hours),
    ((p_day + make_interval(hours => s.same_day_cutoff_hour))::timestamp at time zone s.timezone)
  )
  from app.settings s
$$;

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
    -- Too little time left to confirm (under 30 minutes): don't offer that day.
    exit when deadline < now() + interval '30 minutes';
    insert into app.video_orders (hug_id, recording_day, status, hold_expires_at, note)
    values (w.hug_id, d, 'held', deadline, w.note)
    returning id into oid;
    insert into app.video_status_events (order_id, status, actor) values (oid, 'held', 'system');
    update app.video_waitlist set status = 'offered', held_order_id = oid, updated_at = now() where id = w.id;
    n := n + 1;
  end loop;
  return n;
end $$;

-- Ready: real object + availability window starts.
drop function if exists app.mark_video_ready(uuid, text);
create or replace function app.mark_video_ready(p_order_id uuid, p_path text, p_duration numeric default null) returns void
language plpgsql security definer set search_path = '' as $$
declare o app.video_orders; obj record; keep int;
begin
  select * into o from app.video_orders where id = p_order_id for update;
  if not found then raise exception 'not_found' using errcode = 'WH006'; end if;
  if o.status <> 'recording' then raise exception 'bad_transition' using errcode = 'WH004'; end if;
  select (metadata->>'size')::bigint as size, metadata->>'mimetype' as mime into obj
    from storage.objects where bucket_id = 'hug-videos' and name = p_path;
  if not found or obj.size is null or obj.size < 10240 then
    raise exception 'upload_missing' using errcode = 'WH005';
  end if;
  select video_retention_days into keep from app.settings;
  update app.video_orders
     set status = 'ready', video_path = p_path, video_bytes = obj.size,
         video_mime = coalesce(obj.mime, 'video/mp4'), uploaded_at = now(),
         video_expires_at = now() + make_interval(days => keep),
         video_duration_seconds = p_duration, updated_at = now()
   where id = p_order_id;
  insert into app.video_status_events (order_id, status, actor) values (p_order_id, 'ready', 'studio');
end $$;

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

-- Retention: list delivered videos past their window; the app deletes the object, then marks expired.
create or replace function app.expired_video_paths(p_limit int default 100)
returns table (order_id uuid, video_path text)
language sql stable security definer set search_path = '' as $$
  select id, video_path from app.video_orders
   where status = 'ready' and video_expires_at <= now() and video_path is not null
   order by video_expires_at limit p_limit
$$;

create or replace function app.mark_video_expired(p_order_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update app.video_orders
     set status = 'expired', video_path = null, video_mime = null, video_bytes = null,
         video_deleted_at = now(), updated_at = now()
   where id = p_order_id and status = 'ready' and video_expires_at <= now();
  if found then
    insert into app.video_status_events (order_id, status, actor) values (p_order_id, 'expired', 'system');
  end if;
end $$;

-- The ready guard must allow the ready -> expired transition (file intentionally removed).
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
