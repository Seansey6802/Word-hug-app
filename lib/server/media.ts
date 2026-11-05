// Private media in Supabase Storage. Buckets are private; the only way to read
// or write an object is a short-lived signed URL issued here, after the caller
// has passed the app's capability checks. The service-role key never leaves
// the server and is used for nothing but storage.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const PHOTO_BUCKET = "hug-photos";
export const VIDEO_BUCKET = "hug-videos";

/** How long a viewing link stays valid. */
export const PHOTO_LINK_SECONDS = 10 * 60;
export const VIDEO_LINK_SECONDS = 30 * 60;

type G = { __wordHugStorage?: SupabaseClient };
const g = globalThis as unknown as G;

function client() {
  if (!g.__wordHugStorage) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set.");
    g.__wordHugStorage = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  }
  return g.__wordHugStorage.storage;
}

/** Signed URLs are minted against SUPABASE_URL; rewrite to the origin phones can reach. */
function publicize(u: string) {
  const internal = process.env.SUPABASE_URL;
  const pub = process.env.SUPABASE_PUBLIC_URL;
  return internal && pub && u.startsWith(internal) ? pub + u.slice(internal.length) : u;
}

export async function putPhoto(path: string, bytes: Uint8Array, mime: string) {
  const { error } = await client().from(PHOTO_BUCKET).upload(path, bytes, { contentType: mime, upsert: false, cacheControl: "0" });
  if (error) throw new Error(`Photo upload failed: ${error.message}`);
}

export async function signedViewUrl(bucket: string, path: string, seconds: number) {
  const { data, error } = await client().from(bucket).createSignedUrl(path, seconds);
  if (error || !data) throw new Error(`Could not sign media link: ${error?.message}`);
  return publicize(data.signedUrl);
}

/** A one-time upload URL so large videos go straight from the founder's phone to storage. */
export async function signedUploadUrl(path: string) {
  const { data, error } = await client().from(VIDEO_BUCKET).createSignedUploadUrl(path);
  if (error || !data) throw new Error(`Could not create upload link: ${error?.message}`);
  return { url: publicize(data.signedUrl), token: data.token, path: data.path };
}

export async function removeObjects(bucket: string, paths: (string | null | undefined)[]) {
  const list = paths.filter((p): p is string => Boolean(p));
  if (!list.length) return;
  const { error } = await client().from(bucket).remove(list);
  if (error) throw new Error(`Could not delete media: ${error.message}`);
}

/** Check magic bytes so a renamed file can't masquerade as a photo. */
export function sniffImage(b: Uint8Array): "image/jpeg" | "image/png" | "image/webp" | null {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50)
    return "image/webp";
  return null;
}
