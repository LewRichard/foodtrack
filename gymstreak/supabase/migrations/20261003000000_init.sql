-- GymStreak schema: profiles, friendships, blocks, check-ins (photo + date), reactions, reports.
-- Run with `supabase db push`, or paste into the Supabase SQL editor.
-- Every table uses row level security: you see your own data and your accepted friends' check-ins.

-- ─── Profiles ──────────────────────────────────────────────────────────────
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9_]{3,20}$'),
  display_name text not null check (char_length(display_name) between 1 and 40),
  weekly_goal smallint not null default 3 check (weekly_goal between 1 and 7),
  created_at timestamptz not null default now()
);

-- ─── Friendships ───────────────────────────────────────────────────────────
-- One row per pair. The requester sends, the addressee accepts (status → 'accepted').
create table public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles (id) on delete cascade,
  addressee_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  check (requester_id <> addressee_id)
);
create unique index friendships_pair_idx
  on public.friendships (least(requester_id, addressee_id), greatest(requester_id, addressee_id));
create index friendships_addressee_idx on public.friendships (addressee_id);

create table public.blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

-- ─── Check-ins ─────────────────────────────────────────────────────────────
create table public.checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  photo_path text not null,
  caption text check (char_length(caption) <= 140),
  -- The user's local calendar day the photo was taken. Streaks are computed from this.
  checkin_date date not null,
  created_at timestamptz not null default now()
);
create index checkins_user_date_idx on public.checkins (user_id, checkin_date desc);
create index checkins_created_idx on public.checkins (created_at desc);

create table public.reactions (
  checkin_id uuid not null references public.checkins (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  emoji text not null check (char_length(emoji) between 1 and 8),
  created_at timestamptz not null default now(),
  primary key (checkin_id, user_id)
);

-- Objectionable-content reports (required by App Store guideline 1.2 for user-generated content).
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  checkin_id uuid references public.checkins (id) on delete set null,
  reported_user_id uuid references public.profiles (id) on delete set null,
  reason text not null check (char_length(reason) <= 500),
  created_at timestamptz not null default now()
);

-- ─── Helpers ───────────────────────────────────────────────────────────────
create function public.is_friend(a uuid, b uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.friendships f
    where f.status = 'accepted'
      and ((f.requester_id = a and f.addressee_id = b) or (f.requester_id = b and f.addressee_id = a))
  );
$$;

create function public.is_blocked_between(a uuid, b uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.blocks
    where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a)
  );
$$;

create function public.can_view_user(owner uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select owner = auth.uid() or public.is_friend(owner, auth.uid());
$$;

-- Blocking someone also removes the friendship.
create function public.block_user(target uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null or target = auth.uid() then
    raise exception 'invalid block';
  end if;
  insert into public.blocks (blocker_id, blocked_id) values (auth.uid(), target)
    on conflict do nothing;
  delete from public.friendships
    where (requester_id = auth.uid() and addressee_id = target)
       or (requester_id = target and addressee_id = auth.uid());
end;
$$;

-- In-app account deletion (App Store guideline 5.1.1(v)). The app removes the user's photos from
-- Storage first, then calls this; deleting the auth user cascades to every table above.
create function public.delete_account()
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

revoke execute on function public.delete_account() from public, anon;
grant execute on function public.delete_account() to authenticated;
revoke execute on function public.block_user(uuid) from public, anon;
grant execute on function public.block_user(uuid) to authenticated;

-- ─── Row level security ────────────────────────────────────────────────────
alter table public.profiles enable row level security;
alter table public.friendships enable row level security;
alter table public.blocks enable row level security;
alter table public.checkins enable row level security;
alter table public.reactions enable row level security;
alter table public.reports enable row level security;

-- Profiles are visible to signed-in users (needed to search for friends by username).
create policy "profiles readable by signed-in users" on public.profiles
  for select to authenticated using (true);
create policy "create own profile" on public.profiles
  for insert to authenticated with check (id = auth.uid());
create policy "update own profile" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy "see own friendships" on public.friendships
  for select to authenticated using (auth.uid() in (requester_id, addressee_id));
create policy "send friend requests" on public.friendships
  for insert to authenticated
  with check (
    requester_id = auth.uid()
    and status = 'pending'
    and not public.is_blocked_between(requester_id, addressee_id)
  );
create policy "accept friend requests" on public.friendships
  for update to authenticated
  using (addressee_id = auth.uid() and status = 'pending')
  with check (addressee_id = auth.uid() and status = 'accepted');
create policy "remove friendships" on public.friendships
  for delete to authenticated using (auth.uid() in (requester_id, addressee_id));

create policy "see own blocks" on public.blocks
  for select to authenticated using (blocker_id = auth.uid());
create policy "unblock" on public.blocks
  for delete to authenticated using (blocker_id = auth.uid());

create policy "see own and friends' check-ins" on public.checkins
  for select to authenticated using (public.can_view_user(user_id));
create policy "post own check-ins" on public.checkins
  for insert to authenticated
  with check (
    user_id = auth.uid()
    -- Allow ±1 day for time zones, but no back-dating to fake a streak.
    and checkin_date between current_date - 1 and current_date + 1
    and photo_path like auth.uid()::text || '/%'
  );
create policy "delete own check-ins" on public.checkins
  for delete to authenticated using (user_id = auth.uid());

create policy "see reactions on visible check-ins" on public.reactions
  for select to authenticated
  using (exists (select 1 from public.checkins c where c.id = checkin_id));
create policy "react to visible check-ins" on public.reactions
  for insert to authenticated
  with check (user_id = auth.uid() and exists (select 1 from public.checkins c where c.id = checkin_id));
create policy "change own reaction" on public.reactions
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "remove own reaction" on public.reactions
  for delete to authenticated using (user_id = auth.uid());

create policy "file reports" on public.reports
  for insert to authenticated with check (reporter_id = auth.uid());

-- ─── Photo storage ─────────────────────────────────────────────────────────
-- Private bucket; objects live at "<user id>/<file>.jpg" and are served through signed URLs.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('checkins', 'checkins', false, 5242880, array['image/jpeg']);

create policy "upload own photos" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'checkins' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "view own and friends' photos" on storage.objects
  for select to authenticated
  using (bucket_id = 'checkins' and public.can_view_user(((storage.foldername(name))[1])::uuid));
create policy "delete own photos" on storage.objects
  for delete to authenticated
  using (bucket_id = 'checkins' and (storage.foldername(name))[1] = auth.uid()::text);
