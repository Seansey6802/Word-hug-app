import { devPaymentsEnabled } from "@/lib/payments/dev";
import { deliver, fakeDispute, fakeExpire, fakeSettle } from "@/lib/payments/fake-gateway";

export const runtime = "nodejs";

/** Test hooks for the fake gateway (local only): disputes, expiries, raw event delivery, settling the outbox. */
export async function POST(req: Request) {
  if (!devPaymentsEnabled()) return new Response("Not found", { status: 404 });
  const b = (await req.json().catch(() => ({}))) as { action?: string; paymentIntentId?: string; sessionId?: string; event?: unknown };
  if (b.action === "dispute") return Response.json({ event: fakeDispute(String(b.paymentIntentId)) });
  if (b.action === "expire") fakeExpire(String(b.sessionId));
  if (b.action === "deliver") return Response.json({ delivered: await deliver(b.event) });
  await fakeSettle();
  return Response.json({ ok: true });
}
