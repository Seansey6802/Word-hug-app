// In-process stand-in for Stripe, for local development and automated tests.
// It never touches the network except to deliver webhooks to this app, signed
// with the official Stripe SDK so verification is identical to production.
//
// Test payment methods (chosen on the fake checkout page):
//   pm_fake_ok            authorizes and captures normally
//   pm_fake_decline_later card saved fine, but off-session authorization is declined (insufficient funds)
//   pm_fake_auth_later    card saved fine, but the bank demands the customer authenticate (SCA/3DS)
//   pm_fake_capture_fails authorizes, but capture fails (e.g. authorization lapsed); a fresh charge works
import Stripe from "stripe";
import { randomBytes } from "node:crypto";
import type { AuthorizeResult, CheckoutView, PaymentGateway } from "./gateway";

type PI = {
  id: string; amount: number; status: string; capture: "automatic" | "manual"; customer: string | null;
  paymentMethod: string | null; metadata: Record<string, string>; charge: string | null; amountRefunded: number;
};
type Session = CheckoutView & {
  url: string; successUrl: string; cancelUrl: string; expiresAt: number; amount: number; captureMethod: "automatic" | "manual";
  name: string; description: string;
};
type State = {
  sessions: Map<string, Session>;
  intents: Map<string, PI>;
  setups: Map<string, { id: string; status: string; paymentMethod: string | null; customer: string | null }>;
  idem: Map<string, unknown>;
  outbox: Promise<unknown>;
};

const id = (p: string) => `${p}_fake_${randomBytes(10).toString("hex")}`;
const g = globalThis as unknown as { __wordHugFake?: State };
const st: State = (g.__wordHugFake ??= { sessions: new Map(), intents: new Map(), setups: new Map(), idem: new Map(), outbox: Promise.resolve() });

export const FAKE_WEBHOOK_SECRET = "whsec_local_fake_gateway_secret";
const webhookSecret = () => process.env.STRIPE_WEBHOOK_SECRET || FAKE_WEBHOOK_SECRET;
const sdk = new Stripe("sk_test_fake_never_used");

function event(type: string, object: unknown) {
  return { id: id("evt"), object: "event", api_version: "2026-10-01", created: Math.floor(Date.now() / 1000), livemode: false, type, data: { object } };
}

/** Signs and POSTs an event to this app's webhook, like Stripe would (async, may be retried). */
export async function deliver(evt: unknown) {
  const payload = JSON.stringify(evt);
  const header = sdk.webhooks.generateTestHeaderString({ payload, secret: webhookSecret() });
  const url = `${process.env.APP_URL ?? "http://localhost:3000"}/api/stripe/webhook`;
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json", "stripe-signature": header }, body: payload }).catch(() => null);
    if (r?.ok) return true;
    await new Promise((res) => setTimeout(res, 200 * (attempt + 1)));
  }
  return false;
}
function emit(type: string, object: unknown) {
  const evt = event(type, object);
  // Deliver after the current request finishes, in order, like an async provider.
  st.outbox = st.outbox.then(() => new Promise((r) => setTimeout(r, 30))).then(() => deliver(evt));
  return evt;
}

const piObject = (p: PI) => ({ id: p.id, object: "payment_intent", amount: p.amount, status: p.status, capture_method: p.capture, customer: p.customer, metadata: p.metadata, latest_charge: p.charge, amount_received: p.status === "succeeded" ? p.amount : 0 });
const chargeObject = (p: PI) => ({ id: p.charge, object: "charge", payment_intent: p.id, amount: p.amount, amount_refunded: p.amountRefunded, refunded: p.amountRefunded >= p.amount });
const sessionObject = (s: Session) => ({
  id: s.id, object: "checkout.session", mode: s.mode, status: s.status, payment_status: s.paymentStatus, metadata: s.metadata,
  customer: s.customer, payment_intent: s.paymentIntent, setup_intent: s.setupIntent, amount_total: s.amountTotal,
});

function once<T>(key: string, fn: () => T): T {
  if (st.idem.has(key)) return st.idem.get(key) as T;
  const v = fn();
  st.idem.set(key, v);
  return v;
}

/** Used by the fake checkout page. Returns where to send the browser next. */
export function fakeCompleteCheckout(sessionId: string, choice: string): { ok: boolean; redirect?: string; error?: string } {
  const s = st.sessions.get(sessionId);
  if (!s || s.status !== "open") return { ok: false, error: "This checkout has ended." };
  if (Date.now() / 1000 > s.expiresAt) {
    s.status = "expired";
    emit("checkout.session.expired", sessionObject(s));
    return { ok: false, error: "This checkout expired." };
  }
  if (choice === "decline") return { ok: false, error: "Your card was declined. (Test card) Try another." };
  if (s.mode === "setup") {
    const pm = ["pm_fake_ok", "pm_fake_decline_later", "pm_fake_auth_later", "pm_fake_capture_fails"].includes(choice) ? choice : "pm_fake_ok";
    const si = { id: id("seti"), status: "succeeded", paymentMethod: pm, customer: s.customer };
    st.setups.set(si.id, si);
    s.setupIntent = si.id;
  } else {
    const p: PI = {
      id: id("pi"), amount: s.amount, capture: s.captureMethod, customer: s.customer, paymentMethod: "pm_fake_ok",
      status: s.captureMethod === "manual" ? "requires_capture" : "succeeded", metadata: s.metadata, charge: id("ch"), amountRefunded: 0,
    };
    st.intents.set(p.id, p);
    s.paymentIntent = p.id;
    s.paymentStatus = s.captureMethod === "manual" ? "unpaid" : "paid";
    emit(p.status === "succeeded" ? "payment_intent.succeeded" : "payment_intent.amount_capturable_updated", piObject(p));
  }
  s.status = "complete";
  emit("checkout.session.completed", sessionObject(s));
  return { ok: true, redirect: s.successUrl.replace("{CHECKOUT_SESSION_ID}", s.id) };
}

export function fakeCheckoutInfo(sessionId: string) {
  const s = st.sessions.get(sessionId);
  return s ? { id: s.id, mode: s.mode, status: s.status, amount: s.amount, name: s.name, description: s.description, cancelUrl: s.cancelUrl } : null;
}

/** Test helpers: simulate provider-side events. */
export function fakeDispute(paymentIntentId: string) {
  const p = st.intents.get(paymentIntentId);
  if (!p) return null;
  return emit("charge.dispute.created", { id: id("dp"), object: "dispute", charge: p.charge, payment_intent: p.id, amount: p.amount, status: "needs_response" });
}
export function fakeExpire(sessionId: string) {
  const s = st.sessions.get(sessionId);
  if (!s || s.status !== "open") return;
  s.status = "expired";
  emit("checkout.session.expired", sessionObject(s));
}
export const fakeSettle = () => st.outbox;

export function createFakeGateway(): PaymentGateway {
  const behave = (pm: string) => pm;
  const authorize = (o: { customer: string; paymentMethod: string; amountCents: number; metadata: Record<string, string> }, capture: "manual" | "automatic"): AuthorizeResult => {
    const b = behave(o.paymentMethod);
    const p: PI = { id: id("pi"), amount: o.amountCents, capture, customer: o.customer, paymentMethod: o.paymentMethod, metadata: o.metadata, status: "requires_payment_method", charge: null, amountRefunded: 0 };
    st.intents.set(p.id, p);
    if (b === "pm_fake_decline_later") {
      emit("payment_intent.payment_failed", piObject(p));
      return { ok: false, paymentIntentId: p.id, code: "insufficient_funds", needsCustomer: true, message: "Your card has insufficient funds." };
    }
    if (b === "pm_fake_auth_later") {
      p.status = "requires_action";
      emit("payment_intent.payment_failed", piObject(p));
      return { ok: false, paymentIntentId: p.id, code: "authentication_required", needsCustomer: true, message: "The bank requires the customer to authenticate this payment." };
    }
    p.charge = id("ch");
    p.status = capture === "manual" ? "requires_capture" : "succeeded";
    emit(capture === "manual" ? "payment_intent.amount_capturable_updated" : "payment_intent.succeeded", piObject(p));
    return { ok: true, paymentIntentId: p.id, captureBefore: capture === "manual" ? new Date(Date.now() + 7 * 86400_000).toISOString() : null };
  };

  return {
    kind: "fake",
    async createCustomer() {
      return id("cus");
    },
    async createPaymentCheckout(o) {
      return once(`co:${o.idempotencyKey}`, () => {
        const s: Session = {
          id: id("cs"), url: "", mode: "payment", status: "open", paymentStatus: "unpaid", metadata: o.metadata, customer: o.customer ?? null,
          paymentIntent: null, setupIntent: null, amountTotal: o.amountCents, successUrl: o.successUrl, cancelUrl: o.cancelUrl,
          expiresAt: Math.floor(o.expiresAt.getTime() / 1000), amount: o.amountCents, captureMethod: o.captureMethod, name: o.name, description: o.description,
        };
        s.url = `${process.env.APP_URL ?? "http://localhost:3000"}/dev/checkout/${s.id}`;
        st.sessions.set(s.id, s);
        return { id: s.id, url: s.url };
      });
    },
    async createSetupCheckout(o) {
      return once(`co:${o.idempotencyKey}`, () => {
        const s: Session = {
          id: id("cs"), url: "", mode: "setup", status: "open", paymentStatus: "no_payment_required", metadata: o.metadata, customer: o.customer,
          paymentIntent: null, setupIntent: null, amountTotal: 0, successUrl: o.successUrl, cancelUrl: o.cancelUrl,
          expiresAt: Math.floor(o.expiresAt.getTime() / 1000), amount: 0, captureMethod: "manual", name: "Save a card for your $15 founder video", description: "Nothing is charged now.",
        };
        s.url = `${process.env.APP_URL ?? "http://localhost:3000"}/dev/checkout/${s.id}`;
        st.sessions.set(s.id, s);
        return { id: s.id, url: s.url };
      });
    },
    async getCheckout(sid) {
      const s = st.sessions.get(sid);
      if (!s) throw new Error("No such checkout session");
      const { url: _u, successUrl: _s, cancelUrl: _c, expiresAt: _e, amount: _a, captureMethod: _m, name: _n, description: _d, ...view } = s;
      return view;
    },
    async expireCheckout(sid) {
      fakeExpire(sid);
    },
    async getSetupPaymentMethod(sid) {
      const si = st.setups.get(sid);
      if (!si) throw new Error("No such setup intent");
      return { status: si.status, paymentMethod: si.paymentMethod, customer: si.customer };
    },
    async getPaymentIntent(pid) {
      const p = st.intents.get(pid);
      if (!p) throw new Error("No such payment intent");
      return { id: p.id, status: p.status, amountCapturable: p.status === "requires_capture" ? p.amount : 0, amountReceived: p.status === "succeeded" ? p.amount : 0, latestCharge: p.charge, captureBefore: null };
    },
    async authorizeOffSession(o) {
      return once(`auth:${o.idempotencyKey}`, () => authorize(o, "manual"));
    },
    async chargeOffSession(o) {
      return once(`charge:${o.idempotencyKey}`, () => {
        // A lapsed authorization doesn't stop a fresh charge on a good card.
        const pm = o.paymentMethod === "pm_fake_capture_fails" ? "pm_fake_ok" : o.paymentMethod;
        return authorize({ ...o, paymentMethod: pm }, "automatic");
      });
    },
    async capture(pid, key) {
      return once(`cap:${key}`, () => {
        const p = st.intents.get(pid);
        if (!p) return { ok: false as const, code: "resource_missing", message: "No such payment intent" };
        if (p.status === "succeeded") return { ok: true as const, chargeId: p.charge };
        if (p.paymentMethod === "pm_fake_capture_fails") {
          p.status = "canceled";
          emit("payment_intent.canceled", piObject(p));
          return { ok: false as const, code: "charge_expired_for_capture", message: "The authorization expired before capture." };
        }
        if (p.status !== "requires_capture") return { ok: false as const, code: "payment_intent_unexpected_state", message: `Can't capture a ${p.status} payment.` };
        p.status = "succeeded";
        emit("payment_intent.succeeded", piObject(p));
        return { ok: true as const, chargeId: p.charge };
      });
    },
    async cancelPaymentIntent(pid, key) {
      once(`cancel:${key}`, () => {
        const p = st.intents.get(pid);
        if (p && p.status !== "succeeded" && p.status !== "canceled") {
          p.status = "canceled";
          emit("payment_intent.canceled", piObject(p));
        }
      });
    },
    async refund(o) {
      return once(`refund:${o.idempotencyKey}`, () => {
        const p = st.intents.get(o.paymentIntentId);
        if (!p || p.status !== "succeeded") throw new Error("Nothing to refund");
        p.amountRefunded = Math.min(p.amount, p.amountRefunded + (o.amountCents ?? p.amount));
        emit("charge.refunded", chargeObject(p));
        return { id: id("re") };
      });
    },
    verifyWebhook(raw, sig) {
      return sdk.webhooks.constructEvent(raw, sig ?? "", webhookSecret());
    },
  };
}
