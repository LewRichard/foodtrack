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

/** A photo resized for sharing (smaller than for AI analysis), as a JPEG ready to upload. */
export async function photoForUpload(file: Blob, maxEdge = 1280, quality = 0.8): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const canvas = drawToCanvas(bitmap, bitmap.width, bitmap.height, maxEdge);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Couldn't prepare the photo."))), "image/jpeg", quality),
    );
  } finally {
    bitmap.close();
  }
}

/** A square crop from the middle of a photo (for profile photos), as a small JPEG. */
export async function photoSquare(file: Blob, size = 320, quality = 0.85): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const side = Math.min(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = Math.min(size, side);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas is not supported in this browser.");
    ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Couldn't prepare the photo."))), "image/jpeg", quality),
    );
  } finally {
    bitmap.close();
  }
}
