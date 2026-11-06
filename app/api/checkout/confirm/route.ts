import { reconcileCheckout } from "@/lib/payments/service";
import { fail, json, limit } from "@/lib/server/http";

export const runtime = "nodejs";

/** The return page asks: did this checkout succeed? (Same reconciliation as the webhook.) */
export async function POST(req: Request) {
  try {
    await limit(req, "checkout-confirm", 60, 600);
    const { sessionId } = (await req.json().catch(() => ({}))) as { sessionId?: unknown };
    if (typeof sessionId !== "string" || !/^cs_[A-Za-z0-9_]{8,200}$/.test(sessionId)) return json({ error: "Unknown checkout." }, 400);
    return json(await reconcileCheckout(sessionId));
  } catch (e) {
    if ((e as Error).message?.includes("No such")) return json({ error: "Unknown checkout." }, 404);
    return fail(e);
  }
}
