import { mutate } from "@/lib/server/store";
import { json, ownerHug } from "@/lib/server/http";
import { activeVideoFor, capacity, ownerVideoView } from "@/lib/server/hugs";
import { newId } from "@/lib/server/ids";
import { payments } from "@/lib/commerce/payments";
import type { VideoOrder } from "@/lib/types";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ token: string }> };

/** Request a $15 founder video (demo: nothing is charged). Enforces the daily capacity. */
export async function POST(req: Request, { params }: Ctx) {
  const { token } = await params;
  const r = await ownerHug(req, token);
  if ("error" in r) return r.error;
  const body = (await req.json().catch(() => ({}))) as { note?: unknown };
  const note = String(body.note ?? "").replace(/[<>]/g, "").trim().slice(0, 400);
  const payment = await payments().authorize("hug_video");

  const out = await mutate((db) => {
    const existing = activeVideoFor(db, r.hug.id);
    if (existing && existing.status !== "canceled") return { error: "You've already ordered a video for this hug.", code: 409 };
    const cap = capacity(db);
    if (cap.remaining <= 0) {
      return {
        error: cap.paused
          ? "The studio is taking a short break. Video orders will reopen soon."
          : "Today's recording slots are full. New slots open tomorrow morning.",
        code: 429,
      };
    }
    const now = new Date().toISOString();
    const order: VideoOrder = {
      id: newId(),
      hugId: r.hug.id,
      createdAt: now,
      status: "queued",
      history: [{ status: "queued", at: now }],
      note,
      payment,
    };
    db.videos.push(order);
    const h = db.hugs.find((x) => x.id === r.hug.id)!;
    return { video: ownerVideoView(db, h), capacity: capacity(db) };
  });
  if ("error" in out) return json({ error: out.error }, out.code);
  return json(out);
}

/** Cancel a video that hasn't been recorded yet (demo refund). */
export async function DELETE(req: Request, { params }: Ctx) {
  const { token } = await params;
  const r = await ownerHug(req, token);
  if ("error" in r) return r.error;
  const pay = payments();
  const out = await mutate(async (db) => {
    const v = activeVideoFor(db, r.hug.id);
    if (!v || v.status !== "queued") return { error: "Only videos still waiting in the queue can be cancelled." };
    v.status = "canceled";
    v.canceledReason = "Cancelled by you";
    v.history.push({ status: "canceled", at: new Date().toISOString() });
    v.payment = await pay.refund(v.payment);
    return { ok: true };
  });
  if ("error" in out) return json({ error: out.error }, 409);
  return json(out);
}
