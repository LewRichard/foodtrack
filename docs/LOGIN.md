# Sign-in: email, Google, Apple, Facebook

When Supabase is configured, FoodTrack opens on a sign-in screen. New accounts then answer a few
welcome questions (name, sex, age, height, weight, goal, goal weight, activity) that set their
calorie and nutrient goals; the answers sync with the account. People who already answered on
another device go straight to the diary.

The Google / Apple / Facebook buttons appear only for providers switched on in Supabase, so you
can turn them on one at a time. (The iPhone app built with Capacitor shows email sign-in only for
now; social sign-in there needs native sign-in plugins.)

## 1. URLs (required, also for password reset emails)

Supabase → **Authentication → URL Configuration**:

- **Site URL**: your app's address, e.g. `https://foodtrack-xxxx.onrender.com`
- **Redirect URLs** → Add URL: `https://foodtrack-xxxx.onrender.com/**`
  (add `http://localhost:8787/**` too if you test locally)

## 2. Google

1. https://console.cloud.google.com → create a project → **APIs & Services → OAuth consent screen**:
   External, app name, support email → save.
2. **Credentials → Create credentials → OAuth client ID** → Web application.
   - Authorized JavaScript origins: `https://foodtrack-xxxx.onrender.com`
   - Authorized redirect URIs: `https://<project-ref>.supabase.co/auth/v1/callback`
     (copy it from Supabase → Authentication → Providers → Google)
3. Copy the **Client ID** and **Client secret** into Supabase → Authentication → Providers →
   **Google** → enable → Save.

## 3. Facebook

1. https://developers.facebook.com → My Apps → **Create app** → "Authenticate and request data
   from users with Facebook Login".
2. Facebook Login → Settings → **Valid OAuth Redirect URIs**:
   `https://<project-ref>.supabase.co/auth/v1/callback`
3. App settings → Basic: copy **App ID** and **App secret** into Supabase → Providers →
   **Facebook** → enable → Save. Add a privacy policy URL (`https://…onrender.com/privacy.html`)
   and switch the app to **Live** so everyone (not just you) can sign in.

## 4. Apple (needs a paid Apple Developer account)

1. https://developer.apple.com/account → Certificates, IDs & Profiles:
   - **Identifiers → App IDs**: your app ID with **Sign in with Apple** ticked.
   - **Identifiers → Services IDs** → new, e.g. `com.yourname.foodtrack.web` → enable Sign in with
     Apple → Configure: domain `<project-ref>.supabase.co`, return URL
     `https://<project-ref>.supabase.co/auth/v1/callback`.
   - **Keys** → new key with Sign in with Apple → download the `.p8` file, note the Key ID.
2. Supabase → Providers → **Apple** → enable; Client IDs: the Services ID; fill in Team ID, Key ID
   and the `.p8` contents (Supabase generates the secret) → Save.
   The generated secret expires after 6 months; Supabase reminds you to renew it.

App Store rule: an iPhone app offering Google or Facebook sign-in must also offer Sign in with Apple.
