-- Shows whether your last message in each chat has been seen (the ticks in the chat list).
-- Run once in Supabase → SQL Editor. Safe to run again. Already included in community.sql.

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
