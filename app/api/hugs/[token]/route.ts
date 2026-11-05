import { compose } from "@/lib/composer/index.ts";
import { deleteFile, mutate, read } from "@/lib/server/store";
import { json, ownerHug } from "@/lib/server/http";
import { capacity, ownerVideoView } from "@/lib/server/hugs";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ token: string }> };

/** Owner view: video status, photo settings, studio capacity. */
export async function GET(req: Request, { params }: Ctx) {
  const { token } = await params;
  const r = await ownerHug(req, token);
  if ("error" in r) return r.error;
  const h = r.hug;
  return json(
    await read((db) => ({
      video: ownerVideoView(db, h),
      photo: h.photo ? { allowForVideo: h.photo.allowForVideo, expiresAt: h.photo.expiresAt } : null,
      capacity: capacity(db),
      revisions: h.revisions,
    })),
  );
}

/** "Write me another": recompose with a fresh seed, avoiding lines just seen. */
export async function PATCH(req: Request, { params }: Ctx) {
  const { token } = await params;
  const r = await ownerHug(req, token);
  if ("error" in r) return r.error;
  const body = (await req.json().catch(() => ({}))) as { avoid?: unknown };
  const avoid = Array.isArray(body.avoid) ? body.avoid.map(String).slice(0, 80) : [];

  const out = await mutate((db) => {
    const h = db.hugs.find((x) => x.id === r.hug.id);
    if (!h) return { error: "gone" as const };
    if (db.videos.some((v) => v.hugId === h.id && v.status !== "canceled")) return { error: "locked" as const };
    if (h.revisions >= 25) return { error: "limit" as const };
    h.seed = Math.floor(Math.random() * 2 ** 31);
    h.content = compose({
      category: h.category,
      tone: h.tone,
      intensity: h.intensity,
      name: h.recipientName,
      interests: h.interests,
      occasion: h.occasion,
      avoid: [...avoid, ...h.content.lineIds],
      seed: h.seed,
    });
    h.revisions += 1;
    return { content: h.content };
  });
  if ("error" in out) {
    const msg = {
      gone: "This hug no longer exists.",
      locked: "This hug has a video on order, so the words are locked in. (The founder is reading them!)",
      limit: "That's a lot of drafts! Start a fresh hug for more.",
    }[out.error as "gone" | "locked" | "limit"];
    return json({ error: msg }, 409);
  }
  return json({
    content: { headline: out.content.headline, kicker: out.content.kicker, paragraphs: out.content.paragraphs },
    lineIds: out.content.lineIds,
  });
}

/** Permanently delete the hug, its photo, and any video file. */
export async function DELETE(req: Request, { params }: Ctx) {
  const { token } = await params;
  const r = await ownerHug(req, token);
  if ("error" in r) return r.error;
  await mutate(async (db) => {
    const h = db.hugs.find((x) => x.id === r.hug.id);
    if (!h) return;
    await deleteFile(h.photo?.file);
    for (const v of db.videos.filter((x) => x.hugId === h.id)) await deleteFile(v.video?.file);
    db.videos = db.videos.filter((x) => x.hugId !== h.id);
    db.hugs = db.hugs.filter((x) => x.id !== h.id);
  });
  return json({ ok: true });
}
