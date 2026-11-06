import { devPaymentsEnabled } from "@/lib/payments/dev";
import { fakeCompleteCheckout } from "@/lib/payments/fake-gateway";

export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!devPaymentsEnabled()) return new Response("Not found", { status: 404 });
  const { sessionId, choice } = (await req.json().catch(() => ({}))) as { sessionId?: string; choice?: string };
  const r = fakeCompleteCheckout(String(sessionId ?? ""), String(choice ?? ""));
  return Response.json(r, { status: r.ok ? 200 : 402 });
}
