-- Store school logos in durable Supabase Storage instead of application memory or disk.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('school-logos', 'school-logos', true, 2097152, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "School admins can upload their logo objects" on storage.objects;
create policy "School admins can upload their logo objects"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'school-logos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "School users can update their logo objects" on storage.objects;
create policy "School users can update their logo objects"
on storage.objects for update to authenticated
using (
  bucket_id = 'school-logos'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'school-logos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "School users can delete their logo objects" on storage.objects;
create policy "School users can delete their logo objects"
on storage.objects for delete to authenticated
using (
  bucket_id = 'school-logos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "School logos are publicly readable" on storage.objects;
create policy "School logos are publicly readable"
on storage.objects for select to public
using (bucket_id = 'school-logos');
