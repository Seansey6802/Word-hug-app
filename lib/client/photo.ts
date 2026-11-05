"use client";

/**
 * Re-encodes a photo on the device before upload: resizes to a sensible size
 * and strips all metadata (EXIF, GPS location, camera details) because a
 * canvas export never carries it. We never inspect what's in the picture.
 */
export async function preparePhoto(file: File, max = 1600): Promise<File> {
  if (!/^image\/(jpeg|png|webp|heic|heif)$/.test(file.type) && !file.type.startsWith("image/")) {
    throw new Error("That doesn’t look like a photo.");
  }
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error("We couldn’t read that photo. Try a JPEG or PNG.");
  }
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Your browser couldn’t process that photo.");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  const blob: Blob | null = await new Promise((res) => canvas.toBlob(res, "image/jpeg", 0.86));
  if (!blob) throw new Error("Your browser couldn’t process that photo.");
  return new File([blob], "photo.jpg", { type: "image/jpeg" });
}
