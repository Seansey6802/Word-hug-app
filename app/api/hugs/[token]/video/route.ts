import { bookVideo, cancelVideoByCustomer, confirmHold, ownerState } from "@/lib/server/repo";
import { fail, json, requireOwner } from "@/lib/server/http";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ token: string }> };

/** Book the next available recording day ($15, demo: nothing is charged). */
export async function POST(req: Request, { params }: Ctx) {
  try {
    const hug = await requireOwner(req, (await params).token);
    const body = (await req.json().catch(() => ({}))) as { note?: unknown; confirmHold?: unknown };
    if (body.confirmHold === true) await confirmHold(hug.id);
    else await bookVideo(hug.id, String(body.note ?? "").replace(/[<>]/g, "").trim());
    return json(await ownerState(hug));
  } catch (e) {
    return fail(e);
  }
}

/** Cancel before recording starts (demo authorization released). */
export async function DELETE(req: Request, { params }: Ctx) {
  try {
    const hug = await requireOwner(req, (await params).token);
    await cancelVideoByCustomer(hug.id);
    return json(await ownerState(hug));
  } catch (e) {
    return fail(e);
  }
}
