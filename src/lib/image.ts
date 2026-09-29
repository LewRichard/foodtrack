export interface PreparedImage {
  base64: string; // no data: prefix
  mediaType: "image/jpeg";
  dataUrl: string; // full-size (resized) preview
  thumbnail: string; // small data URL stored with log entries
}

// Claude downsamples anything larger than ~1568px on the long edge, so resizing
// client-side keeps uploads small without losing detail the model would use.
const MAX_EDGE = 1568;
const THUMB_EDGE = 160;

function drawToCanvas(source: CanvasImageSource, width: number, height: number, maxEdge: number): HTMLCanvasElement {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not supported in this browser.");
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

export function prepareFromSource(source: CanvasImageSource, width: number, height: number): PreparedImage {
  const dataUrl = drawToCanvas(source, width, height, MAX_EDGE).toDataURL("image/jpeg", 0.85);
  const thumbnail = drawToCanvas(source, width, height, THUMB_EDGE).toDataURL("image/jpeg", 0.7);
  return { base64: dataUrl.slice(dataUrl.indexOf(",") + 1), mediaType: "image/jpeg", dataUrl, thumbnail };
}

export async function prepareFromFile(file: File): Promise<PreparedImage> {
  // createImageBitmap respects EXIF orientation in modern browsers.
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    return prepareFromSource(bitmap, bitmap.width, bitmap.height);
  } finally {
    bitmap.close();
  }
}
