# Publishing GymStreak to the App Store

A checklist from zero to "Ready for Sale". You don't need a Mac: EAS builds, signs and uploads in the cloud.

## 0. Accounts and costs

- [ ] **Apple Developer Program**: $99/year at [developer.apple.com/programs](https://developer.apple.com/programs/).
      Enrolment approval can take 1–2 days.
- [ ] **Expo account** (free) at [expo.dev](https://expo.dev). Free tier includes a monthly quota of cloud builds.
- [ ] **Supabase project** set up as described in the README. Free tier is fine to launch;
      enable backups or upgrade before you have real users.

## 1. Make the app yours

In `app.json`:

- [ ] `ios.bundleIdentifier` / `android.package`: change `com.yourname.gymstreak` to a reverse-domain ID you own,
      e.g. `com.richardlew.gymstreak`. **It can't be changed after the first upload.**
- [ ] `name`: the name under the icon (max 30 chars on the App Store). Check it isn't already taken in App Store Connect.
- [ ] `version`: the user-visible version (1.0.0). Build numbers auto-increment (`eas.json` → `autoIncrement`).
- [ ] Icon: `assets/icon.png` (1024×1024, no transparency) is a placeholder flame + dumbbell. Replace it if you have a designer.

## 2. Publish your legal pages (required)

Apple requires a **privacy policy URL**. Because the app has user-generated photos, also publish **Terms of Use (EULA)**
that say there is no tolerance for objectionable content or abusive users.

- [ ] Fill in the bracketed parts of `PRIVACY.md` and host it, along with your terms. GitHub Pages, Notion and Carrd all work.
- [ ] Set the URLs in the EAS environment (see step 3) so the app links to them:
      `EXPO_PUBLIC_PRIVACY_URL`, `EXPO_PUBLIC_TERMS_URL`, `EXPO_PUBLIC_SUPPORT_EMAIL`.

## 3. Production environment variables

`.env` is for local development only and isn't uploaded. Add the variables to EAS:

```bash
npx eas-cli@latest env:create --environment production --name EXPO_PUBLIC_SUPABASE_URL --value https://xxx.supabase.co --visibility plaintext
npx eas-cli@latest env:create --environment production --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value eyJ... --visibility plaintext
# + EXPO_PUBLIC_PRIVACY_URL, EXPO_PUBLIC_TERMS_URL, EXPO_PUBLIC_SUPPORT_EMAIL
```

(The anon key is designed to be public. Row level security in the migration is what protects the data.)

## 4. Build and upload

```bash
cd gymstreak
npx eas-cli@latest login
npx eas-cli@latest init                                  # links the project, writes projectId into app.json
npx eas-cli@latest build --platform ios --profile production
npx eas-cli@latest submit --platform ios --latest        # uploads to App Store Connect
```

EAS asks for your Apple ID the first time, then creates the certificates, provisioning profile and the
App Store Connect app record for you.

## 5. Test with TestFlight

- [ ] In App Store Connect → TestFlight, add yourself and your gym friends as testers.
- [ ] Test the full loop on real phones: sign up, add a friend, check in, react, view history, reminders,
      report/block, and delete account.

## 6. App Store listing (App Store Connect → your app)

- [ ] **Subtitle** (30 chars), e.g. "Gym streaks with friends"
- [ ] **Description**, **keywords** (100 chars: `gym,streak,workout,friends,fitness,accountability,photo,habit`)
- [ ] **Screenshots**: required for 6.9" iPhone (1320×2868 or 1290×2796). Take them in the simulator or on a device
      with sample data: feed, camera, history calendar, friends with buddy streaks.
- [ ] **Category**: Health & Fitness (secondary: Social Networking)
- [ ] **Age rating** questionnaire. User-generated content with friends only usually lands at 12+ or 13+.
- [ ] **Support URL** and **Privacy Policy URL**
- [ ] **App Privacy** ("nutrition label"), declare:
  - Contact Info → Email address: App Functionality, linked to user
  - User Content → Photos: App Functionality, linked to user
  - User Content → Other user content (captions, reactions): App Functionality, linked to user
  - Identifiers → User ID: App Functionality, linked to user
  - Not used for tracking. No third-party analytics or ads are included.
- [ ] **Export compliance**: `ITSAppUsesNonExemptEncryption` is already `false` in `app.json` (HTTPS only).

## 7. App Review notes (avoid common rejections)

- [ ] **Demo account**: create a test account with a username, a friend (a second test account) and a few
      check-ins. Put the email and password in *App Review Information*. Reviewers can't test a social app alone.
- [ ] Paste something like this in the review notes:

  > GymStreak lets friends share a photo each time they go to the gym and tracks streaks. Content is only
  > visible to accepted friends. Users can report a photo (Check-in → Report), block a user (Check-in → Block),
  > and delete their account (Profile → Delete account). Reports are reviewed within 24 hours by the developer.

What the build already covers:

| Guideline | Where |
|---|---|
| 1.2 User-generated content: report, block, and filtering | `checkin/[id].tsx`, `reports` table, `block_user()`. Content is friends-only. |
| 5.1.1(v) Account deletion in-app | Profile → Delete account (`delete_account()` + photo removal) |
| 5.1.1 Purpose strings | Camera permission text in `app.json` |
| 2.1 Demo account | You provide it (above) |

**Moderation:** check reports regularly. In Supabase → Table editor → `reports`, delete offending check-ins and,
if needed, the user (Authentication → Users). Apple expects action within 24 hours.

## 8. Release

Submit for review, which usually takes 1–3 days. Choose manual or automatic release. 🎉

## After launch

- JavaScript-only fixes: `npx eas-cli@latest update --channel production` ships over-the-air without review.
  Configure `expo-updates` first: `npx expo install expo-updates && npx eas-cli@latest update:configure`.
- Native changes (new modules, permissions, icon): bump `version` in `app.json`, then build and submit again.
- Android/Google Play: `eas build --platform android` + `eas submit --platform android`. Same code, $25 one-time fee.
