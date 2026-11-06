-- A day follows the studio's default capacity unless the founder set it explicitly.
alter table app.recording_days add column if not exists capacity_override boolean not null default false;
grant update (capacity_override) on app.recording_days to wordhug_app;
