# GymStreak — Locket-style gym streaks with friends

Snap a photo every time you hit the gym. Your friends see it in their feed, you keep a streak going
together, and every check-in photo is saved with its date in your history calendar.

iOS and Android app built with **Expo (React Native, SDK 57)** + **Supabase** (auth, Postgres, photo storage).
No custom server to run.

## Features

| | |
|---|---|
| 📸 **Check-in camera** | Square Locket-style viewfinder, front/back camera, optional caption. Photos are resized to 1080px JPEG before upload. |
| 🔥 **Streaks** | Headline **weekly streak**: set a goal (1–7 gym days/week), hit it every week to grow the streak. Rest days never break it. Also shows a daily streak, best daily streak and total gym days. |
| 🤝 **Buddy streaks** | For every friend: how many weeks in a row you *both* hit your goals. |
| 👥 **Friends** | Search by username, send/accept/decline requests, share an invite, remove friends. |
| 🏠 **Feed** | Your and your friends' check-ins, newest first, with emoji reactions. Pull to refresh, infinite scroll. |
| 📅 **Photo history** | Month calendar with each day's photo as a thumbnail, a monthly gallery, and a detail view with the date, time and caption. Works for friends' profiles too. |
| ⏰ **Reminders** | Local notification at a time you choose. Skipped automatically on days you've already checked in. |
| 🛡️ **Privacy and safety** | Photos sit in a private bucket that only you and accepted friends can read (enforced by row level security). Report, block and in-app account deletion are all included; the App Store requires them. |

## Project layout

```
gymstreak/
├── src/app/                 Expo Router screens
│   ├── _layout.tsx          auth gating (sign-in → onboarding → app)
│   ├── sign-in.tsx, onboarding.tsx
│   ├── (tabs)/              Feed, History, Friends, Profile
│   ├── capture.tsx          camera + caption + post
│   ├── checkin/[id].tsx     photo detail, react, report/block, delete
│   └── user/[id].tsx        a friend's streak + photo history
├── src/components/          UI building blocks (History calendar, StreakCard, Photo…)
├── src/lib/
│   ├── streaks.ts           pure streak/date logic (unit tested)
│   ├── api.ts               all Supabase queries + photo upload
│   ├── auth.tsx             session + profile context
│   └── reminders.ts         local notification scheduling
├── supabase/migrations/     database schema, RLS policies, storage bucket
├── tests/                   vitest unit tests
├── app.json / eas.json      app + build configuration
└── APP_STORE.md             step-by-step publishing guide
```

## 1. Set up Supabase (backend), about 5 minutes

1. Create a free project at [supabase.com](https://supabase.com).
2. Open **SQL Editor**, paste the contents of `supabase/migrations/20261003000000_init.sql` and run it.
   (Or with the Supabase CLI: `supabase link` then `supabase db push`.)
3. **Authentication → Providers → Email**: enabled by default. Decide whether users must confirm their email.
   The app handles both.
4. **Settings → API**: copy the project URL and the `anon` public key.

```bash
cd gymstreak
cp .env.example .env
# fill in EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY
```

Optional, shown in the app when set: `EXPO_PUBLIC_PRIVACY_URL`, `EXPO_PUBLIC_TERMS_URL`, `EXPO_PUBLIC_SUPPORT_EMAIL`.

## 2. Run it on your phone

**Quickest way (free, no Apple account):** install **Expo Go** from the App Store / Play Store, then:

```bash
npm install
npx expo start --go          # add --tunnel if your phone isn't on the same Wi-Fi
```

Scan the QR code with your iPhone camera (Android: from inside Expo Go). Everything works in Expo Go;
for push-style polish and before release, use a **development build**:

```bash
npx eas-cli@latest build --profile development --platform ios   # needs an Apple Developer account
npx expo start
```

## 3. Checks

```bash
npm test            # streak logic unit tests
npm run typecheck
npx eslint .
```

## 4. Publish to the App Store

See **[APP_STORE.md](./APP_STORE.md)**. In short: change the bundle identifier in `app.json`, then run
`eas build --platform ios --profile production` and `eas submit --platform ios`, and fill in the App Store Connect listing.

## How streaks work

- Every check-in stores `checkin_date`, the **local** calendar day the photo was taken, so a 11:30pm
  session counts for that day in any time zone. The database rejects back-dated check-ins (±1 day allowed for time zones).
- **Weekly streak** (`weeklyStreak`): consecutive Monday–Sunday weeks with at least *goal* distinct check-in days.
  The current week only adds to the streak once the goal is met, and doesn't break it while still in progress.
- **Buddy streak** (`weeklyStreakFor`): consecutive weeks in which *each* friend met their own goal.
- **Daily streak**: consecutive days with a check-in. It stays alive until a full day is missed.

All of this is in `src/lib/streaks.ts`, with tests in `tests/streaks.test.ts`.

## Ideas for v2

- **Home-screen widget** showing friends' latest photo (the core Locket feature). Needs a WidgetKit
  extension through a config plugin such as `@bacons/apple-targets`.
- **Push notifications to friends** when someone checks in (Supabase database webhook → Edge Function → Expo Push API).
- **Group streaks** for squads of 3+, built on `weeklyStreakFor`, which already supports N members.
- **Sign in with Apple**. Apple requires it if you ever add Google or other social logins.
