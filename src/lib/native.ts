import { Capacitor } from "@capacitor/core";
import { prepareFromFile, type PreparedImage } from "./image.ts";

/** True inside the iPhone app (Capacitor), false in a browser. */
export const isNative = Capacitor.isNativePlatform();

/**
 * Opens the native camera or photo library and returns the resized photo,
 * or null if the user cancelled.
 */
export async function pickNativePhoto(source: "camera" | "library"): Promise<PreparedImage | null> {
  // Loaded on demand so the browser build doesn't pull in the plugin up front.
  const { Camera, MediaTypeSelection } = await import("@capacitor/camera");
  try {
    const result =
      source === "camera"
        ? await Camera.takePhoto({ quality: 85, correctOrientation: true })
        : (await Camera.chooseFromGallery({ mediaType: MediaTypeSelection.Photo, quality: 85, correctOrientation: true }))
            .results[0];
    if (!result?.webPath) return null;
    const blob = await (await fetch(result.webPath)).blob();
    return await prepareFromFile(new File([blob], "meal.jpg", { type: blob.type || "image/jpeg" }));
  } catch (e) {
    if (e instanceof Error && /cancel/i.test(e.message)) return null;
    throw e;
  }
}
