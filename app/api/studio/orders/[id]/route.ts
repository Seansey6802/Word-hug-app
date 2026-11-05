import { isStudio } from "@/lib/server/studio";
import { deleteFile, mutate } from "@/lib/server/store";
import { json } from "@/lib/server/http";
import { payments } from "@/lib/commerce/payments";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };

// Allowed manual transitions. "ready" is deliberately absent: the only way to
// mark a video ready is to upload the recording (see ./upload).
const NEXT: Record<string, string[]> = {
  queued: ["recording", "canceled"],
  recording: ["queued", "canceled"],
  ready: ["recording"], // re-record: removes the uploaded file
  canceled: [],
};

export async function PATCH(req: Request, { params }: Ctx) {
  if (!(await isStudio())) return json({ error: "Studio sign-in required." }, 401);
  const { id } = await params;
  const { status, reason } = (await req.json().catch(() => ({}))) as { status?: string; reason?: string };
  const pay = payments();
  const out = await mutate(async (db) => {
    const v = db.videos.find((x) => x.id === id);
    if (!v) return { error: "Order not found.", code: 404 };
    if (!status || !NEXT[v.status]?.includes(status)) {
      return { error: `Can't move an order from ${v.status} to ${status ?? "nothing"}.`, code: 409 };
    }
    if (v.status === "ready" && status === "recording") {
      await deleteFile(v.video?.file);
      delete v.video;
    }
    v.status = status as typeof v.status;
    v.history.push({ status: v.status, at: new Date().toISOString() });
    if (status === "canceled") {
      v.canceledReason = String(reason ?? "The studio couldn't record this one").slice(0, 200);
      v.payment = await pay.refund(v.payment);
    }
    return { ok: true };
  });
  if ("error" in out) return json({ error: out.error }, out.code);
  return json(out);
}
