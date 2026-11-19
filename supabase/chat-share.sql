-- Chat extras: photos, shared foods and seen ticks in the chat list.
-- Run once in Supabase → SQL Editor (after community.sql). Safe to run again.
-- Includes everything in chat-photos.sql and chat-seen.sql, so you only need this one.

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

-- A message can carry a shared food or meal (cleaned by the app before it's shown or logged).
alter table public.messages add column if not exists food jsonb;

alter table public.messages drop constraint if exists messages_body_check;
alter table public.messages add constraint messages_body_check
  check (char_length(trim(body)) <= 2000
         and (char_length(trim(body)) >= 1 or image_path is not null or food is not null));

alter table public.messages drop constraint if exists messages_food_check;
alter table public.messages add constraint messages_food_check
  check (food is null or (jsonb_typeof(food) = 'object' and pg_column_size(food) <= 65536));

-- My conversations, newest first, with the last message and how many are unread.
drop function if exists public.my_conversations();
create function public.my_conversations()
returns table (other uuid, username text, display_name text, avatar_path text, last_body text, last_at timestamptz, last_from_me boolean, last_read boolean, last_food text, unread integer)
language sql stable security definer set search_path = '' as $$
  with mine as (
    select m.*, case when m.sender = auth.uid() then m.recipient else m.sender end as other_id
    from public.messages m
    where auth.uid() in (m.sender, m.recipient)
  ), last as (
    select distinct on (other_id) other_id, body, created_at, sender = auth.uid() as from_me, read_at is not null as was_read, food ->> 'title' as food_title
    from mine order by other_id, created_at desc
  )
  select l.other_id, p.username, p.display_name, p.avatar_path, l.body, l.created_at, l.from_me, l.was_read, l.food_title,
         (select count(*)::integer from mine u where u.other_id = l.other_id and u.recipient = auth.uid() and u.read_at is null)
  from last l join public.profiles p on p.id = l.other_id
  where not public.is_blocked_with(l.other_id)
  order by l.created_at desc;
$$;
