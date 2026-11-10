# Apple Health

The iPhone app can read **steps**, **active (exercise) calories** and **weight** from Apple Health.
It never writes to Apple Health. In a browser, or the home-screen web app, the Profile card only explains
that this needs the iPhone app: web pages can't reach Apple Health.

> **Currently switched off.** The code is in place but hidden, and the plugin is left out of the iPhone
> build, so builds work without HealthKit set up. To switch it on: do the Apple setup below, then set
> `APPLE_HEALTH_ENABLED = true` in `src/lib/health.ts`, remove `includePlugins` from `capacitor.config.ts`,
> and add `CODE_SIGN_ENTITLEMENTS = App/App.entitlements;` back to the Debug and Release build settings of
> the App target in `ios/App/App.xcodeproj/project.pbxproj`.

## What happens to the data

- **Steps** show as a fourth number on the diary ("Steps"). They stay on the phone (not backed up).
- **Active calories** fill "Burned" for each of the last 7 days. If a bigger number was typed in by hand, it's kept.
- **Weigh-ins** from the last 30 days fill days that have no weight in FoodTrack yet (a weight typed into
  FoodTrack is never replaced), and the newest one updates the body details.

The app re-reads Health when it opens and whenever it comes back to the front (at most every 5 minutes),
and on "Sync now" in Profile.

## One-time setup for App Store builds

The code, `Info.plist` texts and `ios/App/App/App.entitlements` are already in the project. Apple also needs
HealthKit turned on for the app's ID, otherwise the build fails at code signing:

1. Open https://developer.apple.com/account/resources/identifiers/list and click **com.lewrichard.foodtrack**.
2. Under **Capabilities**, tick **HealthKit** (leave "Clinical Health Records" off), then **Save** and confirm.
3. Provisioning profiles made before this change don't include HealthKit. If Codemagic made yours, it
   makes a new one on the next build. If you made one yourself, open **Profiles**, open the App Store profile
   for FoodTrack, click **Edit** → **Save** to regenerate it, and upload it again to Codemagic.
4. Start a new Codemagic build.

When submitting to App Review, App Store Connect asks about data use: declare **Health & Fitness → Health**
and **Fitness** as collected, linked to the user, used for **App Functionality** only, not for tracking.
The privacy page (`public/privacy.html`) already has an Apple Health section.

## Android / Google Fit

Google has closed its Google Fit APIs to new apps (they're being shut down), so there's nothing to connect a
web app to. Android's replacement, **Health Connect**, only works from a native Android app. FoodTrack doesn't
have an Android build yet; the plugin used here (`@capgo/capacitor-health`) supports Health Connect too, so
`src/lib/health.ts` would work as is once an Android app is added with Capacitor.
