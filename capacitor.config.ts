import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  // The bundle ID must match the one you register in App Store Connect. Change it before your
  // first upload if you'd like a different one; it can't be changed after the app is published.
  appId: "com.lewrichard.foodtrack",
  appName: "FoodTrack",
  webDir: "dist",
  ios: {
    contentInset: "never",
    backgroundColor: "#f4f5f2",
  },
};

export default config;
