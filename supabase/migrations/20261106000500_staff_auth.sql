-- Word Hug — M3: individual founder accounts with MFA (replaces the shared passcode).
--
-- * Founders are Supabase Auth users that ALSO appear in app.staff. Public
--   sign-up is disabled; staff accounts are created by an operator script.
-- * A studio session is only issued for an AAL2 (password + TOTP) Supabase
--   session of an active staff member, and is bound to that person.
-- * Disabling a staff member ends their studio sessions immediately.

create table app.staff (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email extensions.citext not null unique,
  role text not null default 'founder' check (role in ('founder')),
  created_at timestamptz not null default now(),
  disabled_at timestamptz
);

alter table app.staff enable row level security;
alter table app.staff force row level security;
revoke all on app.staff from public, anon, authenticated;
grant select on app.staff to wordhug_app;
create policy server_read on app.staff for select to wordhug_app using (true);

-- Existing passcode sessions are void.
delete from app.studio_sessions;
alter table app.studio_sessions
  add column user_id uuid not null references app.staff (user_id) on delete cascade,
  add column aal text not null check (aal = 'aal2');
