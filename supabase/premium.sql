-- FoodTrack plans: free accounts get a few AI meal logs a day; Premium unlocks the rest.
-- Run this in Supabase → SQL Editor after schema.sql. Safe to run again.
--
-- Only the FoodTrack server (with the service-role key) can grant Premium or count usage.
-- People can read their own rows, nothing else, and can never change them.

create table if not exists public.premium (
  user_id uuid primary key references auth.users (id) on delete cascade,
  until timestamptz, -- when Premium ends; null = no end date
  source text not null default 'manual' check (char_length(source) <= 40), -- manual, stripe, paddle, apple…
  updated_at timestamptz not null default now()
);

-- Added for Paddle: which subscription and customer this Premium comes from (safe to run again).
alter table public.premium add column if not exists subscription_id text check (char_length(subscription_id) <= 100);
alter table public.premium add column if not exists customer_id text check (char_length(customer_id) <= 100);

alter table public.premium enable row level security;
drop policy if exists "premium: read own" on public.premium;
create policy "premium: read own" on public.premium for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.premium from anon;
revoke insert, update, delete on public.premium from authenticated;
grant select on public.premium to authenticated;

-- AI meal logs (photo scans and typed/spoken descriptions) per person per day.
create table if not exists public.ai_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  scans integer not null default 0 check (scans >= 0),
  primary key (user_id, day)
);

alter table public.ai_usage enable row level security;
drop policy if exists "ai usage: read own" on public.ai_usage;
create policy "ai usage: read own" on public.ai_usage for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.ai_usage from anon;
revoke insert, update, delete on public.ai_usage from authenticated;
grant select on public.ai_usage to authenticated;

-- Counts one AI log if the person is under the limit. Returns the new count, or null when the
-- limit was already reached (nothing is counted then). Called by the server only.
create or replace function public.take_ai_scan(p_user uuid, p_day date, p_limit integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  insert into public.ai_usage as u (user_id, day, scans) values (p_user, p_day, 1)
  on conflict (user_id, day) do update set scans = u.scans + 1 where u.scans < p_limit
  returning u.scans into n;
  return n;
end;
$$;

-- Gives a log back when the AI couldn't answer, so a failed scan doesn't use up the day.
create or replace function public.give_back_ai_scan(p_user uuid, p_day date)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.ai_usage set scans = greatest(scans - 1, 0) where user_id = p_user and day = p_day;
$$;

revoke all on function public.take_ai_scan(uuid, date, integer) from public, anon, authenticated;
revoke all on function public.give_back_ai_scan(uuid, date) from public, anon, authenticated;
grant execute on function public.take_ai_scan(uuid, date, integer) to service_role;
grant execute on function public.give_back_ai_scan(uuid, date) to service_role;

-- Old usage rows aren't needed for long; keep the last 60 days.
delete from public.ai_usage where day < current_date - 60;
