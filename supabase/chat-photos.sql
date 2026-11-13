-- Photos in friend chats. Run once in Supabase → SQL Editor (after community.sql). Safe to run again.

-- A message can carry a photo; its text may then be empty.
alter table public.messages add column if not exists image_path text;

alter table public.messages drop constraint if exists messages_body_check;
alter table public.messages add constraint messages_body_check
  check (char_length(trim(body)) <= 2000 and (char_length(trim(body)) >= 1 or image_path is not null));

-- The photo must be in the sender's own folder.
alter table public.messages drop constraint if exists messages_image_path_check;
alter table public.messages add constraint messages_image_path_check
  check (image_path is null or (image_path like sender::text || '/%' and char_length(image_path) <= 200));

-- Private bucket, files under "<sender id>/...". Only the two people in the chat can see a photo.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chat-images', 'chat-images', false, 3145728, array['image/jpeg', 'image/webp', 'image/png'])
on conflict (id) do nothing;

drop policy if exists "chat images: upload to own folder" on storage.objects;
create policy "chat images: upload to own folder" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'chat-images' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "chat images: sender or recipient" on storage.objects;
create policy "chat images: sender or recipient" on storage.objects
  for select to authenticated
  using (bucket_id = 'chat-images'
         and ((storage.foldername(name))[1] = auth.uid()::text
              or exists (select 1 from public.messages m
                         where m.image_path = name and auth.uid() in (m.sender, m.recipient))));

drop policy if exists "chat images: delete own" on storage.objects;
create policy "chat images: delete own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'chat-images' and (storage.foldername(name))[1] = auth.uid()::text);
