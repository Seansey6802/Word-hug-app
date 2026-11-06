import { gateway } from "@/lib/payments/gateway";
import { handleWebhook } from "@/lib/payments/service";

export const runtime = "nodejs";

/**
 * Stripe webhooks. The raw body is verified against STRIPE_WEBHOOK_SECRET
 * before anything is read. Each event is processed once (app.stripe_events);
 * errors return 500 so Stripe retries.
 */
export async function POST(req: Request) {
  const raw = await req.text();
  let evt;
  try {
    evt = (await gateway()).verifyWebhook(raw, req.headers.get("stripe-signature"));
  } catch {
    return new Response("Invalid signature", { status: 400 });
  }
  try {
    const r = await handleWebhook(evt);
    return Response.json({ received: true, duplicate: r.duplicate });
  } catch (e) {
    console.error("[webhook]", evt.type, e);
    return new Response("Processing failed; please retry", { status: 500 });
  }
}
