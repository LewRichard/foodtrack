-- FoodTrack database schema for Supabase.
-- Run this once in your Supabase project: Dashboard → SQL Editor → New query → paste → Run.
-- It's safe to run again: it only creates what's missing and replaces the functions.
--
-- Every row belongs to the signed-in user (user_id = auth.uid()); row level security makes sure
-- people can only read and change their own diary.
--
-- Sync model: the app works offline and pushes changes later. Each row carries `updated_at`
-- (milliseconds, set by the device that made the change); when two devices edit the same row,
-- the newer edit wins. `synced_at` is set by the server and lets devices fetch only what changed.

-- ---------------------------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------------------------

create table if not exists public.food_entries (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date date not null,
  meal text not null check (meal in ('breakfast', 'lunch', 'dinner', 'snack')),
  name text not null check (char_length(name) <= 200),
  portion text not null default '' check (char_length(portion) <= 200),
  grams double precision not null default 0,
  calories double precision not null default 0,
  protein double precision not null default 0,
  carbs double precision not null default 0,
  fat double precision not null default 0,
  fiber double precision not null default 0,
  sugar double precision not null default 0,
  sodium double precision not null default 0,
  confidence text not null default 'high' check (confidence in ('high', 'medium', 'low')),
  source text not null default 'manual' check (source in ('scan', 'manual', 'quick')),
  photo text check (photo is null or char_length(photo) <= 60000), -- small JPEG thumbnail (data URL)
  logged_at bigint not null,
  updated_at bigint not null,
  deleted boolean not null default false, -- kept briefly so other devices learn about deletions
  synced_at timestamptz not null default now()
);

create index if not exists food_entries_user_synced on public.food_entries (user_id, synced_at);

-- Health score (1–10) the photo analysis gave the meal. Added later; running this file again adds it.
alter table public.food_entries add column if not exists health_score smallint
  check (health_score is null or health_score between 1 and 10);

-- Water and exercise for one day.
create table if not exists public.day_logs (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date date not null,
  water integer not null default 0 check (water between 0 and 100),
  burned integer not null default 0 check (burned between 0 and 20000),
  updated_at bigint not null,
  synced_at timestamptz not null default now(),
  primary key (user_id, date)
);

create index if not exists day_logs_user_synced on public.day_logs (user_id, synced_at);

-- Body weight that day (kg). Added later; running this file again adds it.
alter table public.day_logs add column if not exists weight double precision
  check (weight is null or (weight >= 20 and weight <= 400));

-- Name, goals and body details (one row per user).
create table if not exists public.user_settings (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  name text not null default '' check (char_length(name) <= 80),
  goals jsonb not null default '{}'::jsonb,
  profile jsonb,
  updated_at bigint not null,
  synced_at timestamptz not null default now()
);

-- Goal weight (kg). Added later; running this file again adds it.
alter table public.user_settings add column if not exists target_weight double precision
  check (target_weight is null or (target_weight >= 20 and target_weight <= 400));

-- ---------------------------------------------------------------------------------------------
-- Newer-edit-wins and server sync timestamps
-- ---------------------------------------------------------------------------------------------

-- An update older than what's stored (a slow device catching up) is ignored, so it can't
-- overwrite a newer change made elsewhere. Rows can't be moved to another user.
create or replace function public.foodtrack_keep_newest()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if new.user_id is distinct from old.user_id then
      raise exception 'user_id cannot change';
    end if;
    if new.updated_at < old.updated_at then
      return null; -- skip this update, keep the newer row
    end if;
  end if;
  new.synced_at := clock_timestamp();
  return new;
end;
$$;

drop trigger if exists food_entries_keep_newest on public.food_entries;
create trigger food_entries_keep_newest
  before insert or update on public.food_entries
  for each row execute function public.foodtrack_keep_newest();

drop trigger if exists day_logs_keep_newest on public.day_logs;
create trigger day_logs_keep_newest
  before insert or update on public.day_logs
  for each row execute function public.foodtrack_keep_newest();

drop trigger if exists user_settings_keep_newest on public.user_settings;
create trigger user_settings_keep_newest
  before insert or update on public.user_settings
  for each row execute function public.foodtrack_keep_newest();

-- ---------------------------------------------------------------------------------------------
-- Row level security: each user sees and changes only their own rows
-- ---------------------------------------------------------------------------------------------

alter table public.food_entries enable row level security;
alter table public.day_logs enable row level security;
alter table public.user_settings enable row level security;

drop policy if exists "own entries" on public.food_entries;
create policy "own entries" on public.food_entries
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "own day logs" on public.day_logs;
create policy "own day logs" on public.day_logs
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "own settings" on public.user_settings;
create policy "own settings" on public.user_settings
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Signed-out visitors get no access at all.
revoke all on public.food_entries, public.day_logs, public.user_settings from anon;
grant select, insert, update, delete on public.food_entries, public.day_logs, public.user_settings to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Account deletion (required by the App Store for apps with accounts)
-- ---------------------------------------------------------------------------------------------

-- Deletes the signed-in user's account; their diary rows go with it (on delete cascade).
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Meal reminders (web push). Added later; running this file again adds them safely.
-- ---------------------------------------------------------------------------------------------

-- One row per device that allowed notifications. The keys come from the browser's push service.
create table if not exists public.push_subscriptions (
  endpoint text primary key check (char_length(endpoint) <= 2000),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  p256dh text not null check (char_length(p256dh) <= 200),
  auth text not null check (char_length(auth) <= 100),
  user_agent text check (user_agent is null or char_length(user_agent) <= 500),
  created_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user on public.push_subscriptions (user_id);

-- When to remind each person (local times in their time zone; null = that reminder is off).
-- last_sent records the local date each reminder was last handled, so it goes out once a day.
create table if not exists public.reminder_settings (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  enabled boolean not null default true,
  timezone text not null default 'UTC' check (char_length(timezone) <= 64),
  breakfast time,
  lunch time,
  dinner time,
  last_sent jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;
alter table public.reminder_settings enable row level security;

drop policy if exists "own push subscriptions" on public.push_subscriptions;
create policy "own push subscriptions" on public.push_subscriptions
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "own reminder settings" on public.reminder_settings;
create policy "own reminder settings" on public.reminder_settings
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Language for the notification text (added later; safe to run again).
alter table public.reminder_settings add column if not exists language text not null default 'en'
  check (char_length(language) <= 8);

revoke all on public.push_subscriptions, public.reminder_settings from anon;
grant select, insert, update, delete on public.push_subscriptions, public.reminder_settings to authenticated;

-- Registers this device for the signed-in user. A browser keeps the same push address when a
-- different person signs in on it, so any earlier owner's registration for it is replaced.
create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_user_agent text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  delete from public.push_subscriptions where endpoint = p_endpoint;
  insert into public.push_subscriptions (endpoint, user_id, p256dh, auth, user_agent)
  values (p_endpoint, auth.uid(), p_p256dh, p_auth, left(p_user_agent, 500));
end;
$$;

revoke all on function public.save_push_subscription(text, text, text, text) from public, anon;
grant execute on function public.save_push_subscription(text, text, text, text) to authenticated;
