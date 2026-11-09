# Accounts & cloud backup (Supabase)

Without this, FoodTrack keeps the diary only in the browser or app on one device. With it, people can
create an account and their diary is saved online: it survives clearing the browser, and the same account
works on the phone, the computer and the iPhone app. Signing in stays optional.

It uses [Supabase](https://supabase.com) (free plan is enough to start). Setup takes about 15 minutes.

## 1. Create a Supabase project

1. Sign up at <https://supabase.com> (you can use your GitHub account).
2. **New project**. Pick a name (`foodtrack`), set a strong database password (save it somewhere safe),
   choose the region closest to your users (e.g. Singapore for Vietnam), and create it.
   Wait a minute or two until it's ready.

## 2. Create the tables

1. In the project, open **SQL Editor** → **New query**.
2. Open [`supabase/schema.sql`](../supabase/schema.sql) from this repository, copy **all** of it, paste it in,
   and click **Run**. You should see "Success. No rows returned".

This creates the diary tables, the rules that let each person see only their own data, and the
"delete my account" function. Running it again later is safe.

## 3. Choose how sign-up works

**Authentication → Sign In / Providers → Email** (wording may differ slightly):

- **For testing (simplest):** turn **Confirm email** *off*. People can sign up and use the app right away.
- **Before a public launch:** turn **Confirm email** *on* and set up your own email sender under
  **Authentication → Emails → SMTP Settings** (for example with Resend or Brevo, both have free plans).
  Supabase's built-in email sender is only for testing: it sends very few emails per hour and may only
  deliver to your own team's addresses.

## 4. Copy the two connection values

**Project Settings → API** (or **API Keys**):

- **Project URL**: looks like `https://abcdefghijklmnop.supabase.co`
- **anon / publishable key**: starts with `sb_publishable_` (newer projects) or `eyJ` (older ones)

These two are meant to be public: they ship inside the app, and the security rules from step 2 protect
the data. **Never** use the `service_role` / secret key in the app.

## 5. Add them to the app

### Render (your online server)

Service → **Environment** → **Add Environment Variable**, add both, then **Save, rebuild, and deploy**:

| Key | Value |
|---|---|
| `VITE_SUPABASE_URL` | the Project URL |
| `VITE_SUPABASE_ANON_KEY` | the anon / publishable key |

They're built into the web app, so a **rebuild** is needed after changing them (a restart alone isn't enough).

### Your computer (`npm run dev`)

Add the same two lines to `.env`, then restart `npm run dev`.

### iPhone app (Codemagic)

Fill in the same two values under `vars:` in `codemagic.yaml`.

## 6. Try it

Open the app → **Profile** → **Back up & sync** → **Create account**. After signing in, the card shows
"All changes saved". Sign in with the same account in another browser: your diary appears there too.

You can see the stored rows in Supabase under **Table Editor** (`food_entries`, `day_logs`, `user_settings`).

## Only signed-in users can scan

With accounts set up, you can drop the access code and let only signed-in users scan instead: on Render,
set `REQUIRE_SIGN_IN` to `true` and delete `APP_ACCESS_CODE` (or leave it, as an extra way in without an
account). The server checks each scan's sign-in with Supabase using the same two settings, so nothing else
is needed. Signed-out users can still log food by hand; tapping scan asks them to sign in.

## How it works

- The diary is still saved on the device first, so the app is fast and works offline. Changes are uploaded
  a moment later, and downloaded when the app is opened or comes back online.
- If the same item is changed on two devices, the most recent change wins.
- Food logged before signing in is moved into the account at the first sign-in.
- **Sign out** removes the diary from that device (it stays in the account).
- **Delete account** (Profile) permanently deletes the account and all its data. The App Store requires
  this for apps with accounts.

## Troubleshooting

| Message in the Profile card | Fix |
|---|---|
| "The database isn't set up yet" | Run `supabase/schema.sql` (step 2). |
| "Please confirm your email first" | Click the link in the confirmation email, or turn off Confirm email (step 3). |
| "Can't reach the server" | Check the connection; it retries automatically. |
| No "Back up & sync" card at all | The two `VITE_SUPABASE_…` values weren't present when the app was built. Add them and rebuild. |
| "No API key found in request" | The key was pasted with extra characters or is the wrong key. Copy it again with the copy button. |
