// Payment gateway boundary. Two implementations share this interface:
//   * "stripe_test" — the real Stripe API with a TEST-mode key (sk_test_…). Live keys are refused.
//   * "fake"        — an in-process stand-in for local development and automated
//                     tests. It emits webhooks signed with the Stripe SDK, so the
//                     webhook verification and handling code is identical.
// There is no live mode in this codebase. Enabling real charges requires a code
// change and explicit approval.

import type Stripe from "stripe";

export type CheckoutView = {
  id: string;
  mode: "payment" | "setup";
  status: "open" | "complete" | "expired";
  paymentStatus: "paid" | "unpaid" | "no_payment_required";
  metadata: Record<string, string>;
  customer: string | null;
  paymentIntent: string | null;
  setupIntent: string | null;
  amountTotal: number | null;
};

export type AuthorizeResult =
  | { ok: true; paymentIntentId: string; captureBefore: string | null }
  | { ok: false; paymentIntentId: string | null; code: string; needsCustomer: boolean; message: string };

export type CaptureResult = { ok: true; chargeId: string | null } | { ok: false; code: string; message: string };

export interface PaymentGateway {
  kind: "fake" | "stripe";
  createCustomer(metadata: Record<string, string>): Promise<string>;
  createPaymentCheckout(o: {
    amountCents: number;
    name: string;
    description: string;
    successUrl: string;
    cancelUrl: string;
    metadata: Record<string, string>;
    expiresAt: Date;
    captureMethod: "automatic" | "manual";
    customer?: string;
    idempotencyKey: string;
  }): Promise<{ id: string; url: string }>;
  createSetupCheckout(o: {
    customer: string;
    successUrl: string;
    cancelUrl: string;
    metadata: Record<string, string>;
    expiresAt: Date;
    idempotencyKey: string;
  }): Promise<{ id: string; url: string }>;
  getCheckout(id: string): Promise<CheckoutView>;
  expireCheckout(id: string): Promise<void>;
  /** Payment method saved by a completed setup checkout. */
  getSetupPaymentMethod(setupIntentId: string): Promise<{ status: string; paymentMethod: string | null; customer: string | null }>;
  getPaymentIntent(id: string): Promise<{ id: string; status: string; amountCapturable: number; amountReceived: number; latestCharge: string | null; captureBefore: string | null }>;
  /** Merchant-initiated authorization (manual capture) on a saved card. */
  authorizeOffSession(o: { customer: string; paymentMethod: string; amountCents: number; idempotencyKey: string; metadata: Record<string, string> }): Promise<AuthorizeResult>;
  /** Merchant-initiated immediate charge (used only after a verified upload, if an authorization lapsed). */
  chargeOffSession(o: { customer: string; paymentMethod: string; amountCents: number; idempotencyKey: string; metadata: Record<string, string> }): Promise<AuthorizeResult>;
  capture(paymentIntentId: string, idempotencyKey: string): Promise<CaptureResult>;
  cancelPaymentIntent(paymentIntentId: string, idempotencyKey: string): Promise<void>;
  refund(o: { paymentIntentId: string; amountCents?: number; idempotencyKey: string }): Promise<{ id: string }>;
  verifyWebhook(rawBody: string, signature: string | null): Stripe.Event;
}

export function paymentsMode(): "fake" | "stripe_test" {
  const m = process.env.PAYMENTS_MODE ?? "fake";
  if (m === "fake" || m === "stripe_test") return m;
  throw new Error(`PAYMENTS_MODE must be "fake" or "stripe_test" (got "${m}"). Live payments are not enabled in this codebase.`);
}

export function assertTestKey(key: string | undefined) {
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set.");
  if (!/^(sk|rk)_test_/.test(key)) throw new Error("Refusing a non-test Stripe key. Only sk_test_/rk_test_ keys are allowed until live billing is approved.");
  return key;
}

type G = { __wordHugGateway?: PaymentGateway };
const g = globalThis as unknown as G;

export async function gateway(): Promise<PaymentGateway> {
  if (g.__wordHugGateway) return g.__wordHugGateway;
  const mode = paymentsMode();
  g.__wordHugGateway = mode === "stripe_test" ? (await import("./stripe-gateway")).createStripeGateway() : (await import("./fake-gateway")).createFakeGateway();
  return g.__wordHugGateway;
}
