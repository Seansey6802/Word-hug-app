-- Word Hug — private media buckets.
-- Both buckets are private: no public URLs. Objects are only reachable through
-- short-lived signed URLs that the server issues after checking capabilities.
-- No storage.objects policies are created for anon/authenticated, so with RLS
-- on storage.objects they can neither list, read, write nor delete anything.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('hug-photos', 'hug-photos', false, 8388608, array['image/jpeg', 'image/png', 'image/webp']),
  -- 50 MB matches the Supabase Free plan's per-file cap; raise on Pro if needed.
  ('hug-videos', 'hug-videos', false, 52428800, array['video/mp4', 'video/quicktime', 'video/webm'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Defensive: remove any broad policies that might have been added by hand.
do $$
declare p record;
begin
  for p in
    select policyname from pg_policies
     where schemaname = 'storage' and tablename = 'objects'
       and (qual ilike '%hug-photos%' or qual ilike '%hug-videos%' or with_check ilike '%hug-photos%' or with_check ilike '%hug-videos%')
  loop
    execute format('drop policy %I on storage.objects', p.policyname);
  end loop;
end $$;

-- The booking functions read object metadata to verify real uploads.
-- (Functions are SECURITY DEFINER owned by postgres; the server role itself
-- gets no direct access to the storage schema.)
