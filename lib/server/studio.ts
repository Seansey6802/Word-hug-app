import { cookies } from "next/headers";
import { createHash } from "node:crypto";
import { safeEqual } from "./ids";
import { checkStudioSession, createStudioSession, revokeStudioSession } from "./repo";

const COOKIE = "wh_studio";

/**
 * Prototype founder access: a passcode exchanged for a 12-hour, server-side,
 * revocable session (stored hashed in app.studio_sessions). Production should
 * move to Supabase Auth with the founder's email + MFA (see docs/M2-REVIEW.md).
 * Set STUDIO_PASSCODE_SHA256 in production so the passcode itself is never stored.
 */
export function checkPasscode(input: string) {
  const hashed = process.env.STUDIO_PASSCODE_SHA256;
  if (hashed) return safeEqual(createHash("sha256").update(input).digest("hex"), hashed.toLowerCase());
  const plain = process.env.STUDIO_PASSCODE;
  if (!plain) return false; // no passcode configured = studio closed
  // Never accept the published demo passcode on a real deployment.
  const deployed = process.env.VERCEL_ENV === "production" || !/localhost|127\.0\.0\.1/.test(process.env.APP_URL ?? "");
  if (deployed && plain === "demo-studio") return false;
  return safeEqual(input, plain);
}

export async function startSession() {
  const raw = await createStudioSession();
  (await cookies()).set(COOKIE, raw, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 12 * 3600,
  });
}

export async function endSession() {
  const jar = await cookies();
  await revokeStudioSession(jar.get(COOKIE)?.value);
  jar.delete(COOKIE);
}

export async function isStudio() {
  return checkStudioSession((await cookies()).get(COOKIE)?.value);
}
