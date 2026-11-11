# Free and Premium

| | Free | Premium |
|---|---|---|
| AI meal logs (photo or description) | 5 a day | Unlimited |
| Barcode scans, manual entries, everything else | ✓ | ✓ |
| Chat with Lew | — | ✓ |
| AI meal plans + shopping list | — | ✓ |
| AI weekly check-in | — | ✓ |

The limits are enforced by the server, not just the app, so they can't be bypassed.
The free day resets at the person's own midnight.

## Set up (once)

1. Supabase → **SQL Editor** → **New query** → paste all of `supabase/premium.sql` → **Run**.
2. On Render, make sure **SUPABASE_SERVICE_ROLE_KEY** is set (it already is if meal reminders work).
   Without it, nothing is limited and everyone gets every feature.
3. Optional: change **FREE_SCANS_PER_DAY** on Render (default 5).

## Give someone Premium by hand

Until payments are connected, grant Premium in Supabase → SQL Editor (replace the email):

```sql
-- One year of Premium
insert into public.premium (user_id, until, source)
select id, now() + interval '1 year', 'manual' from auth.users where email = 'someone@example.com'
on conflict (user_id) do update set until = excluded.until, source = excluded.source, updated_at = now();

-- Premium with no end date: use null instead of now() + interval '1 year'

-- Remove Premium
delete from public.premium where user_id = (select id from auth.users where email = 'someone@example.com');
```

The app picks it up the next time it's opened or brought to the front.

## Selling Premium

Premium is sold through Paddle; setup is in [PADDLE.md](PADDLE.md). Until Paddle is set up, the upgrade
screen says Premium is coming soon. In the iPhone app the buy button is hidden (Apple only allows its own
in-app purchase for subscriptions); people who bought on the web still get Premium there.
