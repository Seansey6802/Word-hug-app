import { isStudio } from "@/lib/server/studio";
import { refundVideo } from "@/lib/payments/service";
import { fail, json } from "@/lib/server/http";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };

/** Full refund of a captured $15 (test mode). The customer keeps the video. */
export async function POST(req: Request, { params }: Ctx) {
  try {
    if (!(await isStudio())) return json({ error: "Studio sign-in required." }, 401);
    const { reason } = (await req.json().catch(() => ({}))) as { reason?: string };
    await refundVideo((await params).id, String(reason ?? "Refunded by the studio"));
    return json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
