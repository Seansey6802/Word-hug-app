import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { activeStaff, checkStudioSession, createStudioSession, revokeStudioSession } from "./repo";

const COOKIE = "wh_studio";

function decodeClaims(jwt: string): Record<string, unknown> | null {
  try {
    return JSON.parse(Buffer.from(jwt.split(".")[1] ?? "", "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

/**
 * Founder sign-in. The browser signs in to Supabase Auth with the founder's own
 * email + password and completes a TOTP challenge (AAL2). It then hands the
 * access token here once. We verify it with Supabase Auth (signature, expiry,
 * revocation), require AAL2 and an active app.staff row, and issue our own
 * 12-hour, revocable, httpOnly studio session bound to that person.
 */
export async function exchangeForStudioSession(accessToken: string) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase is not configured.");
  const { data, error } = await createClient(url, key, { auth: { persistSession: false } }).auth.getUser(accessToken);
  if (error || !data.user) return { ok: false as const, status: 401, error: "Your sign-in has expired. Please sign in again." };
  const claims = decodeClaims(accessToken);
  if (claims?.aal !== "aal2") return { ok: false as const, status: 403, error: "Two-step verification is required for the studio." };
  if (!(await activeStaff(data.user.id))) return { ok: false as const, status: 403, error: "This account doesn't have studio access." };
  const raw = await createStudioSession(data.user.id);
  (await cookies()).set(COOKIE, raw, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production" && !/localhost|127\.0\.0\.1/.test(process.env.APP_URL ?? ""),
    path: "/",
    maxAge: 12 * 3600,
  });
  return { ok: true as const };
}

export async function endSession() {
  const jar = await cookies();
  await revokeStudioSession(jar.get(COOKIE)?.value);
  jar.delete(COOKIE);
}

/** The signed-in staff member, or null. Customers (owner keys, gift links) never pass this. */
export async function studioUser() {
  return checkStudioSession((await cookies()).get(COOKIE)?.value);
}

export async function isStudio() {
  return Boolean(await studioUser());
}
