// Payment boundary. During the prototype only the demo provider exists:
// it records the intended amount and never contacts any payment service.
//
// Stripe plan (not active): Checkout Sessions for one-off hugs and bundles,
// Billing for subscriptions, a webhook (checkout.session.completed) that marks
// orders paid, and manual capture for videos so customers are only charged
// once a video is actually uploaded — and released if it can't be recorded.

import type { DemoPayment } from "../types";
import { product } from "./products.ts";

export interface PaymentProvider {
  name: "demo" | "stripe";
  /** Reserve funds. For videos this becomes a manual-capture PaymentIntent. */
  authorize(sku: string): Promise<DemoPayment>;
  /** Release a reservation (e.g. a video that couldn't be recorded). */
  refund(p: DemoPayment): Promise<DemoPayment>;
}

const demo: PaymentProvider = {
  name: "demo",
  async authorize(sku) {
    const p = product(sku);
    if (!p) throw new Error(`Unknown product ${sku}`);
    return {
      provider: "demo",
      amountCents: p.amountCents,
      status: p.kind === "video" ? "demo_authorized" : "demo_free",
    };
  },
  async refund(p) {
    return { ...p, status: "demo_refunded" };
  },
};

export function payments(): PaymentProvider {
  const mode = process.env.PAYMENTS_MODE ?? "demo";
  if (mode !== "demo") {
    throw new Error(
      "Only PAYMENTS_MODE=demo is supported in the prototype. Stripe is intentionally not connected.",
    );
  }
  return demo;
}
