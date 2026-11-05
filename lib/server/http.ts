import { NextResponse } from "next/server";
import { AppError } from "./db";
import { ownedHug, rateLimit } from "./repo";

export const json = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

const MESSAGES: Record<string, [number, string]> = {
  not_found: [404, "This hug has been deleted or never existed."],
  forbidden: [403, "Only the person who made this hug can do that."],
  already_booked: [409, "There's already a video booked for this hug."],
  no_capacity: [409, "Every recording day in the next two weeks is full. Join the free waitlist instead."],
  paused: [409, "The studio is taking a short break. Join the free waitlist and we'll hold you a slot."],
  bad_transition: [409, "That isn't possible at this stage of the video."],
  upload_missing: [409, "We couldn't find the uploaded recording. Please upload it again."],
  hold_expired: [409, "That held slot has expired. You're welcome to book the next available day."],
  already_waitlisted: [409, "You're already on the waitlist."],
  locked: [409, "This hug has a video on order, so the words are locked in. (The founder is reading them!)"],
  limit: [409, "That's a lot of drafts! Start a fresh hug for more."],
  consent_required: [400, "Please confirm photo consent, or remove the photo."],
  bad_photo: [400, "Photos must be JPEG, PNG or WebP."],
  photo_too_large: [400, "That photo is over 8 MB."],
  bad_email: [400, "That email address doesn't look right."],
  bad_token: [400, "That recovery link has expired or was already used. Request a new one."],
  bad_video_type: [400, "Videos must be MP4, MOV or WebM."],
  rate_limited: [429, "Too many attempts. Please wait a few minutes and try again."],
};

export function fail(e: unknown) {
  if (e instanceof AppError && MESSAGES[e.code]) {
    const [status, error] = MESSAGES[e.code];
    return json({ error, code: e.code }, status);
  }
  console.error(e);
  return json({ error: "Something went wrong on our side." }, 500);
}

export function clientIp(req: Request) {
  const fwd = (req.headers.get("x-forwarded-for") ?? "").split(",")[0]?.trim();
  return fwd || req.headers.get("x-real-ip") || "local";
}

export async function limit(req: Request, bucket: string, max: number, windowSeconds: number) {
  if (!(await rateLimit(`${bucket}:${clientIp(req)}`, max, windowSeconds))) throw new AppError("rate_limited");
}

/** Owner capability: the x-owner-key header must match the hug's hashed owner key. */
export async function requireOwner(req: Request, token: string) {
  return ownedHug(token, req.headers.get("x-owner-key"));
}
