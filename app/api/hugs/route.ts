import { NextResponse } from "next/server";
import { compose, cleanInterests, cleanName } from "@/lib/composer/index.ts";
import { isCategory, isIntensity, isOccasion, isTone } from "@/lib/catalog";
import { hashKey, newId, newOwnerKey, newToken } from "@/lib/server/ids";
import { mutate, putFile } from "@/lib/server/store";
import { payments } from "@/lib/commerce/payments";
import type { Hug } from "@/lib/types";
import { CONSENT_TEXT, PHOTO_DAYS } from "@/lib/privacy";

export const runtime = "nodejs";

const PHOTO_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const MAX_PHOTO = 8 * 1024 * 1024;

export async function POST(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected form data." }, { status: 400 });
  }

  let data: Record<string, unknown>;
  try {
    data = JSON.parse(String(form.get("data") ?? "{}"));
  } catch {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }

  const { category, tone, intensity, occasion } = data;
  if (!isCategory(category) || !isTone(tone) || !isIntensity(intensity)) {
    return NextResponse.json({ error: "Please choose a kind of hug, a tone and an intensity." }, { status: 400 });
  }
  if (occasion !== undefined && occasion !== null && !isOccasion(occasion)) {
    return NextResponse.json({ error: "Unknown occasion." }, { status: 400 });
  }
  const forSelf = data.forSelf !== false;
  const recipientName = cleanName(String(data.recipientName ?? ""));
  const senderName = forSelf ? "" : cleanName(String(data.senderName ?? ""));
  const interests = cleanInterests(Array.isArray(data.interests) ? data.interests.map(String) : []);
  const avoid = Array.isArray(data.avoid) ? data.avoid.map(String).slice(0, 60) : [];

  // Optional photo: requires explicit consent. We never analyse it.
  const photo = form.get("photo");
  let photoBytes: Uint8Array | null = null;
  let photoMime = "";
  if (photo instanceof File && photo.size > 0) {
    if (data.photoConsent !== true) {
      return NextResponse.json({ error: "Please confirm photo consent, or remove the photo." }, { status: 400 });
    }
    if (!PHOTO_TYPES[photo.type]) {
      return NextResponse.json({ error: "Photos must be JPEG, PNG or WebP." }, { status: 400 });
    }
    if (photo.size > MAX_PHOTO) {
      return NextResponse.json({ error: "That photo is over 8 MB." }, { status: 400 });
    }
    photoBytes = new Uint8Array(await photo.arrayBuffer());
    photoMime = photo.type;
  }

  const seed = Math.floor(Math.random() * 2 ** 31);
  const content = compose({
    category,
    tone,
    intensity,
    name: recipientName,
    interests,
    occasion: isOccasion(occasion) ? occasion : undefined,
    avoid,
    seed,
  });
  const ownerKey = newOwnerKey();
  const now = new Date();
  const hug: Hug = {
    id: newId(),
    token: newToken(),
    ownerKeyHash: hashKey(ownerKey),
    createdAt: now.toISOString(),
    forSelf,
    recipientName,
    senderName,
    category,
    tone,
    intensity,
    occasion: isOccasion(occasion) ? occasion : undefined,
    interests,
    seed,
    content,
    revisions: 0,
    payment: await payments().authorize("hug_written"),
  };

  if (photoBytes) {
    const file = `${newToken()}.${PHOTO_TYPES[photoMime]}`;
    await putFile(file, photoBytes);
    hug.photo = {
      file,
      mime: photoMime,
      bytes: photoBytes.byteLength,
      consentAt: now.toISOString(),
      consentText: CONSENT_TEXT,
      allowForVideo: data.photoForVideo === true,
      expiresAt: new Date(now.getTime() + PHOTO_DAYS * 86400_000).toISOString(),
    };
  }

  await mutate((db) => {
    db.hugs.push(hug);
  });

  return NextResponse.json({ token: hug.token, ownerKey, lineIds: content.lineIds });
}
