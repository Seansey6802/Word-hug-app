import { isCategory, isIntensity, isOccasion, isTone } from "@/lib/catalog";
import { startHugCheckout } from "@/lib/payments/service";
import { fail, json, limit } from "@/lib/server/http";

export const runtime = "nodejs";
const MAX_PHOTO = 8 * 1024 * 1024;

/** Starts a $1 checkout. The hug itself is created only once payment is confirmed. */
export async function POST(req: Request) {
  try {
    await limit(req, "create", 30, 3600);
    const form = await req.formData().catch(() => null);
    if (!form) return json({ error: "Expected form data." }, 400);
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(String(form.get("data") ?? "{}"));
    } catch {
      return json({ error: "Malformed request." }, 400);
    }
    const { category, tone, intensity, occasion } = data;
    if (!isCategory(category) || !isTone(tone) || !isIntensity(intensity)) {
      return json({ error: "Please choose a kind of hug, a tone and an intensity." }, 400);
    }
    if (occasion != null && !isOccasion(occasion)) return json({ error: "Unknown occasion." }, 400);
    const photo = form.get("photo");
    let photoInput = null;
    if (photo instanceof File && photo.size > 0) {
      if (photo.size > MAX_PHOTO) return json({ error: "That photo is over 8 MB." }, 400);
      photoInput = { bytes: new Uint8Array(await photo.arrayBuffer()), consent: data.photoConsent === true, allowForVideo: data.photoForVideo === true };
    }
    const out = await startHugCheckout({
      forSelf: data.forSelf !== false,
      category,
      tone,
      intensity,
      recipientName: String(data.recipientName ?? ""),
      senderName: String(data.senderName ?? ""),
      occasion: isOccasion(occasion) ? occasion : undefined,
      interests: Array.isArray(data.interests) ? data.interests.map(String) : [],
      avoid: Array.isArray(data.avoid) ? data.avoid.map(String).slice(0, 60) : [],
      photo: photoInput,
    });
    return json(out);
  } catch (e) {
    return fail(e);
  }
}
