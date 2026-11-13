-- FoodTrack community: profiles, friends, posts, comments, likes, chat, blocking and reports.
-- Run this in Supabase → SQL Editor after schema.sql. Safe to run again (it only adds what's missing
-- and replaces the functions and policies).
--
-- Privacy is enforced here, in the database, not just in the app:
--   * a post marked "friends" is only readable by the author's friends; "public" by any signed-in user
--   * blocking someone hides their posts and comments from you (and yours from them) and ends the friendship
--   * only friends can message each other; people only ever read their own conversations
--   * post photos live in a private bucket and can only be fetched by people who can see the post

-- ---------------------------------------------------------------------------------------------
-- Profiles (public name card; created when someone first opens the Community tab)
-- ---------------------------------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9_.]{3,20}$'),
  display_name text not null default '' check (char_length(display_name) <= 40),
  accepted_rules_at timestamptz not null default now(), -- agreed to the community rules
  created_at timestamptz not null default now()
);

-- Added for notifications (running the file again adds them to existing databases).
alter table public.profiles add column if not exists notify boolean not null default true; -- community push notifications
alter table public.profiles add column if not exists language text not null default 'en' check (char_length(language) <= 8);
-- Profile photo in the public "avatars" bucket; must be inside the person's own folder.
alter table public.profiles add column if not exists avatar_path text
  check (avatar_path is null or (avatar_path like id::text || '/%' and char_length(avatar_path) <= 200));

alter table public.profiles enable row level security;

drop policy if exists "profiles are visible to signed-in users" on public.profiles;
create policy "profiles are visible to signed-in users" on public.profiles
  for select to authenticated using (true);
drop policy if exists "people create their own profile" on public.profiles;
create policy "people create their own profile" on public.profiles
  for insert to authenticated with check (id = auth.uid());
drop policy if exists "people edit their own profile" on public.profiles;
create policy "people edit their own profile" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- ---------------------------------------------------------------------------------------------
-- Blocks and friendships
-- ---------------------------------------------------------------------------------------------

create table if not exists public.blocks (
  blocker uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  blocked uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker, blocked),
  check (blocker <> blocked)
);

alter table public.blocks enable row level security;

drop policy if exists "people see their own blocks" on public.blocks;
create policy "people see their own blocks" on public.blocks
  for select to authenticated using (blocker = auth.uid());
drop policy if exists "people block others" on public.blocks;
create policy "people block others" on public.blocks
  for insert to authenticated with check (blocker = auth.uid());
drop policy if exists "people unblock" on public.blocks;
create policy "people unblock" on public.blocks
  for delete to authenticated using (blocker = auth.uid());

create table if not exists public.friendships (
  requester uuid not null references public.profiles (id) on delete cascade,
  addressee uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  primary key (requester, addressee),
  check (requester <> addressee)
);

-- One row per pair, whichever direction the request went.
create unique index if not exists friendships_pair on public.friendships (least(requester, addressee), greatest(requester, addressee));
create index if not exists friendships_addressee on public.friendships (addressee);

alter table public.friendships enable row level security;

-- Read-only for the two people involved; changes go through the functions below.
drop policy if exists "people see their own friendships" on public.friendships;
create policy "people see their own friendships" on public.friendships
  for select to authenticated using (auth.uid() in (requester, addressee));

create or replace function public.is_friend(other uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.friendships f
    where f.status = 'accepted'
      and ((f.requester = auth.uid() and f.addressee = other) or (f.requester = other and f.addressee = auth.uid()))
  );
$$;

create or replace function public.is_blocked_with(other uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.blocks b
    where (b.blocker = auth.uid() and b.blocked = other) or (b.blocker = other and b.blocked = auth.uid())
  );
$$;

-- Blocking someone ends any friendship or pending request with them.
create or replace function public.end_friendship_on_block()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  delete from public.friendships f
  where (f.requester = new.blocker and f.addressee = new.blocked) or (f.requester = new.blocked and f.addressee = new.blocker);
  return new;
end;
$$;

drop trigger if exists blocks_end_friendship on public.blocks;
create trigger blocks_end_friendship after insert on public.blocks
  for each row execute function public.end_friendship_on_block();

-- Sends a request, or accepts theirs if they already asked. Returns 'pending' or 'accepted'.
create or replace function public.send_friend_request(target uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
begin
  if me is null then raise exception 'not signed in'; end if;
  if target = me then raise exception 'cannot befriend yourself'; end if;
  if not exists (select 1 from public.profiles where id = me) then raise exception 'create a profile first'; end if;
  if not exists (select 1 from public.profiles where id = target) then raise exception 'no such user'; end if;
  if public.is_blocked_with(target) then raise exception 'blocked'; end if;

  update public.friendships set status = 'accepted'
  where requester = target and addressee = me and status = 'pending';
  if found then return 'accepted'; end if;

  if exists (select 1 from public.friendships f
             where (f.requester = me and f.addressee = target) or (f.requester = target and f.addressee = me)) then
    return (select f.status from public.friendships f
            where (f.requester = me and f.addressee = target) or (f.requester = target and f.addressee = me));
  end if;

  insert into public.friendships (requester, addressee) values (me, target);
  return 'pending';
end;
$$;

-- Accepts or declines a request someone sent me.
create or replace function public.respond_friend_request(requester_id uuid, accept boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if accept then
    update public.friendships set status = 'accepted'
    where requester = requester_id and addressee = auth.uid() and status = 'pending';
  else
    delete from public.friendships
    where requester = requester_id and addressee = auth.uid() and status = 'pending';
  end if;
end;
$$;

-- Unfriends, or cancels a request I sent.
create or replace function public.remove_friend(other uuid)
returns void language sql security definer set search_path = '' as $$
  delete from public.friendships f
  where (f.requester = auth.uid() and f.addressee = other) or (f.requester = other and f.addressee = auth.uid());
$$;

-- Everyone I'm connected to: friends, requests I received and requests I sent.
drop function if exists public.my_connections(); -- (its columns changed when photos were added)
create function public.my_connections()
returns table (id uuid, username text, display_name text, avatar_path text, state text)
language sql stable security definer set search_path = '' as $$
  select p.id, p.username, p.display_name, p.avatar_path,
         case when f.status = 'accepted' then 'friend'
              when f.addressee = auth.uid() then 'incoming'
              else 'outgoing' end
  from public.friendships f
  join public.profiles p on p.id = case when f.requester = auth.uid() then f.addressee else f.requester end
  where auth.uid() in (f.requester, f.addressee)
  order by p.username;
$$;

-- Finds people by username or display name (not me, nobody blocked either way).
drop function if exists public.search_profiles(text);
create function public.search_profiles(query text)
returns table (id uuid, username text, display_name text, avatar_path text, state text)
language sql stable security definer set search_path = '' as $$
  select p.id, p.username, p.display_name, p.avatar_path,
         coalesce((select case when f.status = 'accepted' then 'friend'
                               when f.addressee = auth.uid() then 'incoming'
                               else 'outgoing' end
                   from public.friendships f
                   where (f.requester = auth.uid() and f.addressee = p.id) or (f.requester = p.id and f.addressee = auth.uid())), 'none')
  from public.profiles p
  where auth.uid() is not null
    and p.id <> auth.uid()
    and char_length(trim(query)) >= 2
    and (p.username like lower(trim(query)) || '%' or p.display_name ilike '%' || trim(query) || '%')
    and not public.is_blocked_with(p.id)
  order by p.username
  limit 20;
$$;

-- ---------------------------------------------------------------------------------------------
-- Posts, likes and comments
-- ---------------------------------------------------------------------------------------------

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  author uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  body text not null default '' check (char_length(body) <= 2000),
  image_path text check (image_path is null or char_length(image_path) <= 200),
  visibility text not null default 'friends' check (visibility in ('public', 'friends')),
  day_summary jsonb check (day_summary is null or pg_column_size(day_summary) < 1000),
  like_count integer not null default 0,
  comment_count integer not null default 0,
  created_at timestamptz not null default now(),
  check (char_length(trim(body)) > 0 or image_path is not null)
);

create index if not exists posts_created on public.posts (created_at desc);
create index if not exists posts_author_created on public.posts (author, created_at desc);
create index if not exists posts_image on public.posts (image_path) where image_path is not null;

create or replace function public.can_see_post(post_author uuid, post_visibility text)
returns boolean language sql stable security definer set search_path = '' as $$
  select post_author = auth.uid()
      or ((post_visibility = 'public' or public.is_friend(post_author)) and not public.is_blocked_with(post_author));
$$;

alter table public.posts enable row level security;

drop policy if exists "people see posts shared with them" on public.posts;
create policy "people see posts shared with them" on public.posts
  for select to authenticated using (public.can_see_post(author, visibility));
drop policy if exists "people post as themselves" on public.posts;
create policy "people post as themselves" on public.posts
  for insert to authenticated
  with check (author = auth.uid() and like_count = 0 and comment_count = 0
              and (image_path is null or image_path like auth.uid()::text || '/%'));
drop policy if exists "people delete their own posts" on public.posts;
create policy "people delete their own posts" on public.posts
  for delete to authenticated using (author = auth.uid());

create table if not exists public.post_likes (
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create index if not exists post_likes_user on public.post_likes (user_id);

alter table public.post_likes enable row level security;

-- (The subqueries on posts go through its own policy, so only visible posts count.)
drop policy if exists "people see likes on posts they can see" on public.post_likes;
create policy "people see likes on posts they can see" on public.post_likes
  for select to authenticated using (exists (select 1 from public.posts p where p.id = post_id));
drop policy if exists "people like posts they can see" on public.post_likes;
create policy "people like posts they can see" on public.post_likes
  for insert to authenticated
  with check (user_id = auth.uid() and exists (select 1 from public.posts p where p.id = post_id));
drop policy if exists "people unlike" on public.post_likes;
create policy "people unlike" on public.post_likes
  for delete to authenticated using (user_id = auth.uid());

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  author uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 1000),
  created_at timestamptz not null default now()
);

create index if not exists comments_post on public.comments (post_id, created_at);

alter table public.comments enable row level security;

drop policy if exists "people see comments on posts they can see" on public.comments;
create policy "people see comments on posts they can see" on public.comments
  for select to authenticated
  using (exists (select 1 from public.posts p where p.id = post_id) and not public.is_blocked_with(author));
drop policy if exists "people comment on posts they can see" on public.comments;
create policy "people comment on posts they can see" on public.comments
  for insert to authenticated
  with check (author = auth.uid() and exists (select 1 from public.posts p where p.id = post_id));
drop policy if exists "people delete their comments or comments on their posts" on public.comments;
create policy "people delete their comments or comments on their posts" on public.comments
  for delete to authenticated
  using (author = auth.uid() or exists (select 1 from public.posts p where p.id = post_id and p.author = auth.uid()));

-- Keep like/comment counts on the post (people can't edit posts, so the counts can't be faked).
create or replace function public.bump_post_counts()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  delta integer := case when tg_op = 'INSERT' then 1 else -1 end;
  target uuid := case when tg_op = 'INSERT' then new.post_id else old.post_id end;
begin
  if tg_table_name = 'post_likes' then
    update public.posts set like_count = greatest(0, like_count + delta) where id = target;
  else
    update public.posts set comment_count = greatest(0, comment_count + delta) where id = target;
  end if;
  return null;
end;
$$;

drop trigger if exists post_likes_count on public.post_likes;
create trigger post_likes_count after insert or delete on public.post_likes
  for each row execute function public.bump_post_counts();
drop trigger if exists comments_count on public.comments;
create trigger comments_count after insert or delete on public.comments
  for each row execute function public.bump_post_counts();

-- ---------------------------------------------------------------------------------------------
-- Chat (between friends)
-- ---------------------------------------------------------------------------------------------

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  sender uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  recipient uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 2000),
  created_at timestamptz not null default now(),
  read_at timestamptz,
  check (sender <> recipient)
);

create index if not exists messages_pair on public.messages (least(sender, recipient), greatest(sender, recipient), created_at desc);
create index if not exists messages_unread on public.messages (recipient) where read_at is null;

alter table public.messages enable row level security;

drop policy if exists "people read their own conversations" on public.messages;
create policy "people read their own conversations" on public.messages
  for select to authenticated using (auth.uid() in (sender, recipient));
drop policy if exists "people message their friends" on public.messages;
create policy "people message their friends" on public.messages
  for insert to authenticated
  with check (sender = auth.uid() and read_at is null and public.is_friend(recipient) and not public.is_blocked_with(recipient));

-- Marks everything a friend sent me as read.
create or replace function public.mark_conversation_read(other uuid)
returns void language sql security definer set search_path = '' as $$
  update public.messages set read_at = now()
  where recipient = auth.uid() and sender = other and read_at is null;
$$;

-- My conversations, newest first, with the last message and how many are unread.
drop function if exists public.my_conversations();
create function public.my_conversations()
returns table (other uuid, username text, display_name text, avatar_path text, last_body text, last_at timestamptz, last_from_me boolean, last_read boolean, unread integer)
language sql stable security definer set search_path = '' as $$
  with mine as (
    select m.*, case when m.sender = auth.uid() then m.recipient else m.sender end as other_id
    from public.messages m
    where auth.uid() in (m.sender, m.recipient)
  ), last as (
    select distinct on (other_id) other_id, body, created_at, sender = auth.uid() as from_me, read_at is not null as was_read
    from mine order by other_id, created_at desc
  )
  select l.other_id, p.username, p.display_name, p.avatar_path, l.body, l.created_at, l.from_me, l.was_read,
         (select count(*)::integer from mine u where u.other_id = l.other_id and u.recipient = auth.uid() and u.read_at is null)
  from last l join public.profiles p on p.id = l.other_id
  where not public.is_blocked_with(l.other_id)
  order by l.created_at desc;
$$;

-- Live updates for new messages (Supabase Realtime still applies the policies above).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages') then
    alter publication supabase_realtime add table public.messages;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Reports (reviewed by you in Supabase → Table Editor → reports)
-- ---------------------------------------------------------------------------------------------

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter uuid not null default auth.uid() references auth.users (id) on delete cascade,
  target_type text not null check (target_type in ('post', 'comment', 'user', 'message')),
  target_id uuid not null,
  reason text not null default '' check (char_length(reason) <= 500),
  created_at timestamptz not null default now()
);

alter table public.reports enable row level security;

drop policy if exists "people file reports" on public.reports;
create policy "people file reports" on public.reports
  for insert to authenticated with check (reporter = auth.uid());

-- ---------------------------------------------------------------------------------------------
-- Post photos: private bucket, files under "<user id>/..."
-- ---------------------------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('post-images', 'post-images', false, 3145728, array['image/jpeg', 'image/webp', 'image/png'])
on conflict (id) do nothing;

drop policy if exists "post images: upload to own folder" on storage.objects;
create policy "post images: upload to own folder" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'post-images' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "post images: owner or viewers of the post" on storage.objects;
create policy "post images: owner or viewers of the post" on storage.objects
  for select to authenticated
  using (bucket_id = 'post-images'
         and ((storage.foldername(name))[1] = auth.uid()::text
              or exists (select 1 from public.posts p where p.image_path = name)));

drop policy if exists "post images: delete own" on storage.objects;
create policy "post images: delete own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'post-images' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------------------------------------------------------------------------------------------
-- Profile photos: public bucket (anyone with the link can see a profile photo, like most apps),
-- files under "<user id>/...", only the owner can add, replace or remove them
-- ---------------------------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 1048576, array['image/jpeg', 'image/webp', 'image/png'])
on conflict (id) do nothing;

drop policy if exists "avatars: upload to own folder" on storage.objects;
create policy "avatars: upload to own folder" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatars: see own files" on storage.objects;
create policy "avatars: see own files" on storage.objects
  for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatars: delete own" on storage.objects;
create policy "avatars: delete own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------------------------------------------------------------------------------------------
-- Streak leaderboard. Each person's app publishes their own streak here. Friends always see each
-- other's; the global board only lists people who chose to join it. Blocked people never see each other.
-- ---------------------------------------------------------------------------------------------

create table if not exists public.streaks (
  user_id uuid primary key default auth.uid() references public.profiles (id) on delete cascade,
  current_days integer not null default 0 check (current_days between 0 and 5000),
  longest_days integer not null default 0 check (longest_days between 0 and 5000 and longest_days >= current_days),
  last_date date, -- the last day logged; a streak that ended before yesterday counts as 0
  public boolean not null default false, -- listed on the global board
  updated_at timestamptz not null default now()
);

create index if not exists streaks_public_rank on public.streaks (current_days desc) where public;

alter table public.streaks enable row level security;

drop policy if exists "streaks: own, friends', or public" on public.streaks;
create policy "streaks: own, friends', or public" on public.streaks
  for select to authenticated
  using (user_id = auth.uid() or ((public or public.is_friend(user_id)) and not public.is_blocked_with(user_id)));
drop policy if exists "streaks: publish own" on public.streaks;
create policy "streaks: publish own" on public.streaks
  for insert to authenticated with check (user_id = auth.uid() and (last_date is null or last_date <= current_date + 1));
drop policy if exists "streaks: update own" on public.streaks;
create policy "streaks: update own" on public.streaks
  for update to authenticated using (user_id = auth.uid())
  with check (user_id = auth.uid() and (last_date is null or last_date <= current_date + 1));
drop policy if exists "streaks: remove own" on public.streaks;
create policy "streaks: remove own" on public.streaks
  for delete to authenticated using (user_id = auth.uid());

-- ---------------------------------------------------------------------------------------------
-- Permissions for the functions
-- ---------------------------------------------------------------------------------------------

revoke all on function public.is_friend(uuid) from public, anon;
revoke all on function public.is_blocked_with(uuid) from public, anon;
revoke all on function public.can_see_post(uuid, text) from public, anon;
revoke all on function public.send_friend_request(uuid) from public, anon;
revoke all on function public.respond_friend_request(uuid, boolean) from public, anon;
revoke all on function public.remove_friend(uuid) from public, anon;
revoke all on function public.my_connections() from public, anon;
revoke all on function public.search_profiles(text) from public, anon;
revoke all on function public.mark_conversation_read(uuid) from public, anon;
revoke all on function public.my_conversations() from public, anon;
revoke all on function public.end_friendship_on_block() from public, anon, authenticated;
revoke all on function public.bump_post_counts() from public, anon, authenticated;

grant execute on function public.is_friend(uuid) to authenticated;
grant execute on function public.is_blocked_with(uuid) to authenticated;
grant execute on function public.can_see_post(uuid, text) to authenticated;
grant execute on function public.send_friend_request(uuid) to authenticated;
grant execute on function public.respond_friend_request(uuid, boolean) to authenticated;
grant execute on function public.remove_friend(uuid) to authenticated;
grant execute on function public.my_connections() to authenticated;
grant execute on function public.search_profiles(text) to authenticated;
grant execute on function public.mark_conversation_read(uuid) to authenticated;
grant execute on function public.my_conversations() to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Photos in friend chats (same as chat-photos.sql)
-- ---------------------------------------------------------------------------------------------

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
