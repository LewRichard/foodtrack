-- Wakes the FoodTrack server every 10 minutes so it can send meal reminders that are due.
-- Run this once in Supabase: Dashboard → SQL Editor → New query → paste → edit the two values → Run.
--
-- Before running, replace:
--   YOUR-APP          with your Render app's name, keeping the rest of the address, e.g.
--                     'https://foodtrack-abcd.onrender.com/api/cron/reminders'
--                     (the "/api/cron/reminders" part is required; without it you'll get 404)
--   YOUR-CRON-SECRET  with the same value as CRON_SECRET on Render
--
-- Side effect: the regular calls also keep Render's free server from going to sleep, so the app
-- opens quickly. (One always-on free service stays within Render's monthly free hours.)

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Remove an earlier version of the job, if any, so this can be run again after editing.
select cron.unschedule(jobid) from cron.job where jobname = 'foodtrack-reminders';

select cron.schedule(
  'foodtrack-reminders',
  '*/10 * * * *',
  $$
  select net.http_post(
    url := 'https://YOUR-APP.onrender.com/api/cron/reminders',
    headers := jsonb_build_object('content-type', 'application/json', 'x-cron-secret', 'YOUR-CRON-SECRET'),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);

-- To check it's working (after 10–20 minutes):
--   select status_code, content, created from net._http_response order by created desc limit 5;
-- 200 with {"people":…} means it worked; 401 means the secret doesn't match CRON_SECRET on Render;
-- 404 means the address is missing "/api/cron/reminders" at the end.
-- To stop it:  select cron.unschedule('foodtrack-reminders');
