// The real Stripe API, TEST MODE ONLY. Not exercised in this sandbox (no key was
// provided); every call mirrors what the fake gateway simulates.
import Stripe from "stripe";
import { assertTestKey, type AuthorizeResult, type PaymentGateway } from "./gateway";

export function createStripeGateway(): PaymentGateway {
  const stripe = new Stripe(assertTestKey(process.env.STRIPE_SECRET_KEY), { maxNetworkRetries: 2, appInfo: { name: "Word Hug" } });
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  const fail = (e: unknown, piId: string | null): AuthorizeResult => {
    const err = e as Stripe.errors.StripeError & { payment_intent?: { id: string } };
    const code = err.decline_code ?? err.code ?? "unknown";
    return {
      ok: false,
      paymentIntentId: err.payment_intent?.id ?? piId,
      code,
      // authentication_required = the bank wants the customer present (SCA/3DS).
      needsCustomer: true,
      message: err.message?.slice(0, 280) ?? "Payment failed",
    };
  };

  return {
    kind: "stripe",
    async createCustomer(metadata) {
      return (await stripe.customers.create({ metadata })).id;
    },
    async createPaymentCheckout(o) {
      const s = await stripe.checkout.sessions.create(
        {
          mode: "payment",
          customer: o.customer,
          line_items: [{ quantity: 1, price_data: { currency: "usd", unit_amount: o.amountCents, product_data: { name: o.name, description: o.description } } }],
          payment_intent_data: { capture_method: o.captureMethod, metadata: o.metadata },
          metadata: o.metadata,
          success_url: o.successUrl,
          cancel_url: o.cancelUrl,
          expires_at: Math.floor(o.expiresAt.getTime() / 1000),
        },
        { idempotencyKey: o.idempotencyKey },
      );
      return { id: s.id, url: s.url! };
    },
    async createSetupCheckout(o) {
      const s = await stripe.checkout.sessions.create(
        {
          mode: "setup",
          customer: o.customer,
          currency: "usd",
          setup_intent_data: { metadata: o.metadata },
          metadata: o.metadata,
          success_url: o.successUrl,
          cancel_url: o.cancelUrl,
          expires_at: Math.floor(o.expiresAt.getTime() / 1000),
        },
        { idempotencyKey: o.idempotencyKey },
      );
      return { id: s.id, url: s.url! };
    },
    async getCheckout(id) {
      const s = await stripe.checkout.sessions.retrieve(id);
      return {
        id: s.id,
        mode: s.mode === "setup" ? "setup" : "payment",
        status: (s.status ?? "open") as "open" | "complete" | "expired",
        paymentStatus: s.payment_status as "paid" | "unpaid" | "no_payment_required",
        metadata: (s.metadata ?? {}) as Record<string, string>,
        customer: typeof s.customer === "string" ? s.customer : (s.customer?.id ?? null),
        paymentIntent: typeof s.payment_intent === "string" ? s.payment_intent : (s.payment_intent?.id ?? null),
        setupIntent: typeof s.setup_intent === "string" ? s.setup_intent : (s.setup_intent?.id ?? null),
        amountTotal: s.amount_total,
      };
    },
    async expireCheckout(id) {
      await stripe.checkout.sessions.expire(id).catch(() => undefined);
    },
    async getSetupPaymentMethod(id) {
      const si = await stripe.setupIntents.retrieve(id);
      return {
        status: si.status,
        paymentMethod: typeof si.payment_method === "string" ? si.payment_method : (si.payment_method?.id ?? null),
        customer: typeof si.customer === "string" ? si.customer : (si.customer?.id ?? null),
      };
    },
    async getPaymentIntent(id) {
      const pi = await stripe.paymentIntents.retrieve(id);
      const cb = (pi as unknown as { latest_charge?: { payment_method_details?: { card?: { capture_before?: number } } } }).latest_charge;
      return {
        id: pi.id,
        status: pi.status,
        amountCapturable: pi.amount_capturable,
        amountReceived: pi.amount_received,
        latestCharge: typeof pi.latest_charge === "string" ? pi.latest_charge : (pi.latest_charge?.id ?? null),
        captureBefore: cb?.payment_method_details?.card?.capture_before ? new Date(cb.payment_method_details.card.capture_before * 1000).toISOString() : null,
      };
    },
    async authorizeOffSession(o) {
      try {
        const pi = await stripe.paymentIntents.create(
          {
            amount: o.amountCents,
            currency: "usd",
            customer: o.customer,
            payment_method: o.paymentMethod,
            off_session: true,
            confirm: true,
            capture_method: "manual",
            metadata: o.metadata,
            expand: ["latest_charge"],
          },
          { idempotencyKey: o.idempotencyKey },
        );
        if (pi.status !== "requires_capture") return { ok: false, paymentIntentId: pi.id, code: pi.status, needsCustomer: true, message: `Unexpected status ${pi.status}` };
        const ch = pi.latest_charge as Stripe.Charge | null;
        const cb = ch?.payment_method_details?.card?.capture_before;
        return { ok: true, paymentIntentId: pi.id, captureBefore: cb ? new Date(cb * 1000).toISOString() : null };
      } catch (e) {
        return fail(e, null);
      }
    },
    async chargeOffSession(o) {
      try {
        const pi = await stripe.paymentIntents.create(
          { amount: o.amountCents, currency: "usd", customer: o.customer, payment_method: o.paymentMethod, off_session: true, confirm: true, metadata: o.metadata },
          { idempotencyKey: o.idempotencyKey },
        );
        if (pi.status !== "succeeded") return { ok: false, paymentIntentId: pi.id, code: pi.status, needsCustomer: true, message: `Unexpected status ${pi.status}` };
        return { ok: true, paymentIntentId: pi.id, captureBefore: null };
      } catch (e) {
        return fail(e, null);
      }
    },
    async capture(id, idempotencyKey) {
      try {
        const pi = await stripe.paymentIntents.capture(id, {}, { idempotencyKey });
        return pi.status === "succeeded"
          ? { ok: true, chargeId: typeof pi.latest_charge === "string" ? pi.latest_charge : (pi.latest_charge?.id ?? null) }
          : { ok: false, code: pi.status, message: `Capture status ${pi.status}` };
      } catch (e) {
        const err = e as Stripe.errors.StripeError;
        return { ok: false, code: err.code ?? "capture_failed", message: err.message?.slice(0, 280) ?? "Capture failed" };
      }
    },
    async cancelPaymentIntent(id, idempotencyKey) {
      await stripe.paymentIntents.cancel(id, {}, { idempotencyKey });
    },
    async refund(o) {
      const r = await stripe.refunds.create({ payment_intent: o.paymentIntentId, amount: o.amountCents }, { idempotencyKey: o.idempotencyKey });
      return { id: r.id };
    },
    verifyWebhook(raw, sig) {
      if (!secret) throw new Error("STRIPE_WEBHOOK_SECRET is not set.");
      return stripe.webhooks.constructEvent(raw, sig ?? "", secret);
    },
  };
}
