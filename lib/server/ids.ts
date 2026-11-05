import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/** 128 bits of randomness, URL-safe. Unguessable gift links. */
export const newToken = () => randomBytes(16).toString("base64url");
export const newId = () => randomBytes(9).toString("base64url");
export const newOwnerKey = () => randomBytes(24).toString("base64url");
export const hashKey = (key: string) => createHash("sha256").update(key).digest("hex");

export function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export function verifyOwner(ownerKey: string | null | undefined, hash: string) {
  if (!ownerKey || ownerKey.length > 100) return false;
  return safeEqual(hashKey(ownerKey), hash);
}

export function sign(value: string, secret: string) {
  return createHmac("sha256", secret).update(value).digest("base64url");
}
