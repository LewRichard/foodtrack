# Meal reminders (push notifications)

FoodTrack can nudge people at meal times ("🍳 Breakfast time. Snap your breakfast to log it") and
**only when they haven't logged that meal yet**. Tapping the notification opens the scan screen.
People turn it on and pick times in **Profile → Meal reminders**.

- **Website / home-screen app:** web push, sent by the server. Needs accounts (docs/DATABASE.md).
  On iPhone it works only after **Share → Add to Home Screen** and opening FoodTrack from that icon
  (iOS 16.4+); that's an Apple rule for web apps. Android and computers work in Chrome, Edge or Firefox.
- **iPhone app (App Store build):** notifications are scheduled on the phone itself. No setup needed.

Setup for the website takes about 10 minutes.

## 1. Update the database

Run [`supabase/schema.sql`](../supabase/schema.sql) again in **Supabase → SQL Editor** (copy all → Run).
It adds the reminder tables and leaves your existing data alone.

## 2. Create the notification keys

On your computer, in the project folder:

```bash
npx web-push generate-vapid-keys
```

It prints a **Public Key** and a **Private Key**. Keep the private key secret.

## 3. Add settings on Render

Service → **Environment** → **Edit** → add:

| Key | Value |
|---|---|
| `VAPID_PUBLIC_KEY` | the Public Key from step 2 |
| `VAPID_PRIVATE_KEY` | the Private Key from step 2 |
| `VAPID_SUBJECT` | `mailto:` followed by your email, e.g. `mailto:you@gmail.com` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API Keys → the **secret** key (`sb_secret_…`, or `service_role` under Legacy). Server only: never put it in a `VITE_` setting. |
| `CRON_SECRET` | any long random text, e.g. 30+ letters and digits (Render can generate one) |

Then **Save, rebuild, and deploy**. Check `https://<your-app>.onrender.com/api/health` shows `"reminders":true`.

## 4. Schedule the reminder check

Open [`supabase/reminders-cron.sql`](../supabase/reminders-cron.sql), replace the two placeholders
(your Render address and the `CRON_SECRET` value), and run it in **Supabase → SQL Editor**.

This wakes the server every 10 minutes to send any reminders that are due. It also keeps Render's free
server awake, so the app opens without the usual one-minute wait.

To check it after 10–20 minutes, run this in the SQL Editor:

```sql
select status_code, content, created from net._http_response order by created desc limit 5;
```

`200` with `{"people":…}` means it works. `401` means the secret doesn't match `CRON_SECRET` on Render.
`404` means the address in the job is missing `/api/cron/reminders` at the end.

## 5. Try it

Profile → **Meal reminders** → choose times → **Turn on reminders** → allow notifications →
**Send a test**. A notification should appear within a few seconds.

## Troubleshooting

| Problem | Fix |
|---|---|
| "Reminders aren't set up on the server yet" | One of the step 3 settings is missing; check `/api/health`. |
| "Notifications are blocked" | Allow notifications for the site (browser site settings, or iPhone Settings → Notifications → FoodTrack). |
| iPhone says to add to Home Screen | Required by iOS for web notifications; open FoodTrack from the home-screen icon. |
| Test works but meal reminders never come | Step 4 isn't running: check the `net._http_response` query above. |
| A reminder didn't come | It's skipped if that meal is already logged, and goes out within 45 minutes of the chosen time. |
