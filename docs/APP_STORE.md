# Publishing FoodTrack on the App Store

The `ios/` folder is a native iPhone app (built with Capacitor) that wraps the FoodTrack web app and uses
the iPhone's own camera. Apple only builds iPhone apps on a Mac, so this guide uses **Codemagic**, which
builds on Macs in the cloud. Everything below works from Windows.

**What you'll need:** an Apple Developer account ($99/year), an iPhone for testing, and your FoodTrack
server online (step 1). Expect a few hours of setup spread over a few days, mostly waiting on Apple.

---

## 1. Put the server online

The iPhone app talks to your server for photo analysis, so the server must be online first.
Follow **"Put it online"** in the main [README](../README.md) (Render is easiest). Note the `https://…` address.

About `APP_ACCESS_CODE`:
- **Just you and friends (via TestFlight, step 6):** keep an access code.
- **Public on the App Store:** Apple expects a public app to work for everyone, so leave the code
  empty and rely on the scan limits plus a monthly spend limit in the Anthropic Console. If you keep
  a code, you must give it to Apple's reviewers in the review notes (step 7).

## 2. Join the Apple Developer Program

Enroll at <https://developer.apple.com/programs/enroll/> ($99/year). Approval for individuals usually
takes up to 48 hours.

## 3. Register the app with Apple

1. **Bundle ID.** At <https://developer.apple.com/account/resources/identifiers/list>, click **+** →
   **App IDs** → **App**. Description `FoodTrack`, Bundle ID **Explicit**: `com.lewrichard.foodtrack`.
   No extra capabilities are needed. (If you want a different ID, change it in `capacitor.config.ts`,
   `codemagic.yaml` and the Xcode project before your first upload; it can't change later.)
2. **App record.** At <https://appstoreconnect.apple.com> → **Apps** → **+** → **New App**. Platform iOS,
   choose a name (it must be unique on the store: "FoodTrack" may be taken, so try something like
   "FoodTrack: Calorie Scanner"), language, the bundle ID from above, and any SKU (e.g. `foodtrack`).
3. Open the new app → **App Information** and copy the **Apple ID** (a long number). You need it in step 5.

## 4. Create an App Store Connect API key

This lets Codemagic sign and upload builds for you.

1. App Store Connect → **Users and Access** → **Integrations** → **App Store Connect API** →
   **Team Keys** → **+**.
2. Name it `Codemagic`, access **App Manager**, then **Generate**.
3. **Download the `.p8` file** (Apple lets you download it only once) and note the **Issuer ID** and **Key ID**.

## 5. Set up Codemagic

1. Sign up at <https://codemagic.io> with your GitHub account and add the `foodtrack` repository.
   Choose **codemagic.yaml** as the configuration.
2. **Add the API key:** Team settings → **Integrations** → **Developer Portal** → **Connect**.
   Name it `FoodTrack ASC key` and enter the Issuer ID, Key ID and `.p8` file from step 4.
3. **Create a signing certificate:** Team settings → **codemagic.yaml settings** → **Code signing
   identities** → **iOS certificates** → generate a new **Apple Distribution** certificate using that API
   key. Save the password it shows you somewhere safe.
4. **Fill in `codemagic.yaml`** (you can edit it on github.com: open the file → pencil icon):
   - `VITE_API_URL`: your server address from step 1, e.g. `https://foodtrack-abcd.onrender.com`
   - `APP_STORE_APPLE_ID`: the number from step 3
   - `app_store_connect:` only if you named the integration something other than `FoodTrack ASC key`
5. In Codemagic, click **Start new build**, pick the branch, and choose the **iOS → TestFlight** workflow.
   A build takes about 10–20 minutes. If it fails, open the failed step's log; most first-time
   failures are a typo in one of the three values above or a missing certificate.

Codemagic's docs describe the same setup in more detail; check them if a screen looks different:
<https://docs.codemagic.io/yaml-quick-start/building-an-ionic-app/>.

## 6. Test on your iPhone with TestFlight

1. After a successful build, the app appears in App Store Connect → your app → **TestFlight**
   (Apple processes it for 5–30 minutes first).
2. Under **Internal Testing**, create a group, add yourself (and up to 100 people on your team).
3. Install **TestFlight** from the App Store on your iPhone and accept the invite.

Check: taking a photo, choosing from the library, the consent screen, the access code (if set),
logging food, and that a real scan returns sensible numbers.

**For personal use you can stop here.** TestFlight builds work for 90 days; run a new build to refresh.
External testers (up to 10,000, by email or public link) need a quick Apple review of the first build.

## 7. Submit for App Store review

In App Store Connect → your app → the **1.0 Prepare for Submission** page:

| Field | What to enter |
|---|---|
| Screenshots | At least 3 from a 6.9" iPhone (1320 × 2868). Take them on your iPhone via TestFlight with real meals; Apple scales them for other sizes. |
| Description, keywords | What the app does. Don't promise exact or medically accurate numbers. |
| Support URL | Any page where people can reach you (your server's address works). |
| Privacy Policy URL | `https://<your server>/privacy.html`. **Fill in the placeholders in `public/privacy.html` first.** |
| Category | Health & Fitness |
| Age rating | Answer the questionnaire (no objectionable content). |
| Build | Pick the build Codemagic uploaded. |
| Review notes | Explain that photos are sent to an AI service to estimate nutrition, after an in-app consent screen. If you kept an access code, give it here. |

**App Privacy** (the "nutrition label"): if accounts are turned on (docs/DATABASE.md), declare data
that's linked to the user and used for app functionality only (no tracking):
- **Contact Info → Email Address**
- **Health & Fitness → Health** (food, nutrition, water and exercise entries)
- **User Content → Photos** (the small meal thumbnails saved with entries)
- **Identifiers → User ID**

Meal photos sent for analysis aren't stored by the server. Without accounts, the diary stays on the device
and **Data Not Collected** is likely accurate. Either way, read Apple's definitions and answer for how *you*
run the server (analytics or kept logs change the answers). Because the app has accounts, Apple also
requires in-app account deletion: that's the **Delete account** button in Profile.

Then **Add for Review** → **Submit**. Review usually takes 1–3 days.

### Common reasons apps like this get rejected

- **4.2 Minimum functionality** (just a website in a wrapper): FoodTrack uses the native camera and photo
  library, works offline for logging, and stores data on device, which helps. Mention these in the notes.
- **1.4.1 Health accuracy:** keep the "estimates, not medical advice" wording; don't claim precision.
- **5.1.2 Sharing data with third-party AI:** handled by the consent screen and privacy policy; make sure
  the policy is filled in.
- **2.1 App completeness:** the reviewer must be able to scan. Check that the server is up (Render's free
  tier sleeps; the first scan after a pause can time out, so consider a paid instance while in review)
  and that the access code, if any, is in the notes.
- **3.1.1 Payments:** if you later charge for scans, it must be through Apple's in-app purchase.

## Updating the app

- **Web-only changes** (most of `src/`): run a new Codemagic build; the build number goes up automatically.
  For a new App Store version, also raise the version (e.g. 1.0 → 1.1) in Xcode's project settings
  (`MARKETING_VERSION` in `ios/App/App.xcodeproj/project.pbxproj`) and submit it.
- **Server changes** (`server/`): just redeploy the server; the app picks them up immediately.

## Working on a Mac instead

With a Mac and Xcode: `npm install`, then `VITE_API_URL=https://your-server npm run ios:sync`, then
`npm run ios:open`. In Xcode, select the **App** target → **Signing & Capabilities** → your team, then
**Product → Archive** → **Distribute App**.
