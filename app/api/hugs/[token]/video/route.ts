import { cancelVideoByCustomer, ownerState } from "@/lib/server/repo";
import { releaseAuthorization, reconcileCheckout, startVideoCheckout, startVideoPaymentFix } from "@/lib/payments/service";
import { fail, json, requireOwner } from "@/lib/server/http";
import { one } from "@/lib/server/db";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ token: string }> };

/**
 * { note }            → hold the next slot and open Checkout to save a card (nothing charged)
 * { fixPayment: true }→ customer re-authorizes / pays after an off-session failure
 * { confirm: cs_… }   → the return page reconciles a completed checkout
 */
export async function POST(req: Request, { params }: Ctx) {
  try {
    const hug = await requireOwner(req, (await params).token);
    const body = (await req.json().catch(() => ({}))) as { note?: unknown; fixPayment?: unknown; confirm?: unknown };
    if (typeof body.confirm === "string") {
      if (!/^cs_[A-Za-z0-9_]{8,200}$/.test(body.confirm)) return json({ error: "Unknown checkout." }, 400);
      const r = await reconcileCheckout(body.confirm);
      return json({ checkout: r.state, state: await ownerState(hug) });
    }
    if (body.fixPayment === true) return json(await startVideoPaymentFix(hug));
    return json(await startVideoCheckout(hug, String(body.note ?? "").replace(/[<>]/g, "").trim().slice(0, 400)));
  } catch (e) {
    return fail(e);
  }
}

/** Cancel before recording starts. Any authorization is released; nothing is charged. */
export async function DELETE(req: Request, { params }: Ctx) {
  try {
    const hug = await requireOwner(req, (await params).token);
    const o = await one<{ id: string }>("select id from app.video_orders where hug_id = $1 and status in ('held','booked')", [hug.id]);
    await cancelVideoByCustomer(hug.id);
    if (o) await releaseAuthorization(o.id);
    return json(await ownerState(hug));
  } catch (e) {
    return fail(e);
  }
}
