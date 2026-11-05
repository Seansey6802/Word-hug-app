-- LOCAL DEVELOPMENT ONLY. `supabase db reset` runs this; production never does.
-- Lets the app connect as the least-privilege role with a throwaway password.
alter role wordhug_app with login password 'wordhug-local-dev-only';
