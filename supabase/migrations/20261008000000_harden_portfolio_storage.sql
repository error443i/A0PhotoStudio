update storage.buckets
set file_size_limit = 4194304,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
where id = 'portfolio-photos';

revoke insert, update, delete on public.admin_users from anon, authenticated;
revoke update on public.story_photos from anon, authenticated;

drop policy if exists "Admins can upload portfolio photos" on storage.objects;

notify pgrst, 'reload schema';
