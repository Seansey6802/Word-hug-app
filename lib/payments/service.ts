// Word Hug payment rules (Stripe TEST mode / fake gateway).
//
//  Written hug, $1 — paid before delivery:
//    draft → Checkout (automatic capture) → payment confirmed → hug created & delivered.
//
//  Founder video, $15 — charged only after a verified upload:
//    1. Book: a 30-minute slot hold, then Checkout in SETUP mode saves the card
//       (customer present, 3-D Secure if the bank asks). Only now does the order exist.
//       Nothing is charged.
//    2. Start recording: an off-session $15 AUTHORIZATION (manual capture) must
//       succeed first. If the bank declines or wants the customer, recording is
//       blocked and the customer is asked to authorize on-session.
//    3. Verified upload → CAPTURE. If capture fails, one fresh off-session charge
//       is attempted; otherwise the customer is asked to pay. The video is released
//       to viewers only once a capture has succeeded.
//
// Why authorize at recording time rather than at booking: Stripe documents card
// authorizations as valid for ~7 days for customer-initiated payments, and only
// ~5 days (4 days 18 hours for Visa) for merchant-initiated ones. With a 7-day
// booking window, an authorization placed at booking can lapse before capture.

import type Stripe from "stripe";
import { AppError, dbCode, one, q, tx } from "../server/db";
import { attachDraftCheckout, closeDraft, createDraft, draftBySession, finalizeDraft, type CreateHugInput } from "../server/repo";
import { gateway } from "./gateway";
import { VIDEO_PRICE_CENTS, WRITTEN_PRICE_CENTS } from "../commerce/products";

const appUrl = () => process.env.APP_URL ?? "http://localhost:3000";
const minutes = (n: number) => new Date(Date.now() + n * 60_000);

type PaymentRow = {
  id: string; video_order_id: string | null; hug_id: string | null; provider: "fake" | "stripe"; amount_cents: number; status: string;
  stripe_customer_id: string | null; stripe_payment_method_id: string | null; stripe_payment_intent_id: string | null;
};

async function wrap<T>(p: Promise<T>) {
  try {
    return await p;
  } catch (e) {
    const code = dbCode(e);
    if (code) throw new AppError(code);
    throw e;
  }
}

// ------------------------------------------------------------ written hug, $1

export async function startHugCheckout(input: CreateHugInput) {
  const gw = await gateway();
  const draft = await createDraft(input);
  const session = await gw.createPaymentCheckout({
    amountCents: WRITTEN_PRICE_CENTS,
    name: "Written Word Hug",
    description: draft.recipientName ? `A Word Hug for ${draft.recipientName}` : "A Word Hug, just for you",
    successUrl: `${appUrl()}/checkout/return?session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${appUrl()}/create?checkout=canceled`,
    metadata: { kind: "hug", draft_id: draft.draftId },
    expiresAt: minutes(60),
    captureMethod: "automatic",
    idempotencyKey: `hug-checkout:${draft.draftId}`,
  });
  await attachDraftCheckout(draft.draftId, session.id);
  return { checkoutUrl: session.url, draftId: draft.draftId, ownerKey: draft.ownerKey };
}

// ------------------------------------------------------------ founder video, $15

async function hugOrderForCheckout(hugId: string, note: string) {
  // A waitlist hold already reserved for this hug is paid for as-is.
  const held = await one<{ id: string; hold_expires_at: Date; hold_kind: string }>(
    "select id, hold_expires_at, hold_kind from app.video_orders where hug_id = $1 and status = 'held' and hold_expires_at > now()",
    [hugId],
  );
  if (held && held.hold_kind === "waitlist") return { orderId: held.id, holdEnds: held.hold_expires_at };
  const r = await wrap(one<{ order_id: string; hold_expires_at: Date }>("select * from app.reserve_video($1, $2)", [hugId, note]));
  return { orderId: r!.order_id, holdEnds: r!.hold_expires_at };
}

export async function startVideoCheckout(hug: { id: string; token: string }, note: string) {
  const gw = await gateway();
  const { orderId, holdEnds } = await hugOrderForCheckout(hug.id, note);
  // Stripe Checkout sessions must live 30 min – 24 h; never outlive the hold.
  const end = new Date(Math.min(holdEnds.getTime() - 60_000, Date.now() + 23 * 3600_000));
  if (end.getTime() < Date.now() + 30 * 60_000) throw new AppError("hold_expired");
  const customer = await gw.createCustomer({ hug_id: hug.id, video_order_id: orderId });
  const session = await gw.createSetupCheckout({
    customer,
    successUrl: `${appUrl()}/h/${hug.token}?video_checkout={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${appUrl()}/h/${hug.token}?video_checkout=canceled`,
    metadata: { kind: "video_setup", video_order_id: orderId, hug_id: hug.id },
    expiresAt: end,
    idempotencyKey: `video-setup:${orderId}`,
  });
  await q("select app.attach_checkout($1, $2)", [orderId, session.id]);
  return { checkoutUrl: session.url };
}

const paymentForOrder = (orderId: string) => one<PaymentRow>("select * from app.payments where video_order_id = $1", [orderId]);

/** Recording may start only after a successful $15 authorization. */
export async function authorizeForRecording(orderId: string) {
  const gw = await gateway();
  return tx(async (c) => {
    const { rows } = await c.query<PaymentRow>("select * from app.payments where video_order_id = $1 for update", [orderId]);
    const p = rows[0];
    if (!p) throw new AppError("payment_not_authorized");
    if (p.status === "authorized" || p.status === "captured") return { ok: true as const };
    if (!["method_saved", "action_required"].includes(p.status) || !p.stripe_customer_id || !p.stripe_payment_method_id) {
      throw new AppError("payment_not_authorized");
    }
    const r = await gw.authorizeOffSession({
      customer: p.stripe_customer_id,
      paymentMethod: p.stripe_payment_method_id,
      amountCents: p.amount_cents,
      idempotencyKey: `auth:${p.id}:${Date.now()}`,
      metadata: { kind: "video_auth", video_order_id: orderId },
    });
    if (r.ok) {
      await c.query(
        "update app.payments set status = 'authorized', stripe_payment_intent_id = $2, capture_before = $3, last_error = null, updated_at = now() where id = $1",
        [p.id, r.paymentIntentId, r.captureBefore],
      );
      return { ok: true as const };
    }
    await c.query(
      "update app.payments set status = 'action_required', stripe_payment_intent_id = coalesce($2, stripe_payment_intent_id), last_error = $3, updated_at = now() where id = $1",
      [p.id, r.paymentIntentId, `${r.code}: ${r.message}`.slice(0, 300)],
    );
    return { ok: false as const, code: r.code };
  });
}

/** After a verified upload: capture, falling back to one fresh charge. Returns whether the video is released. */
export async function captureAfterUpload(orderId: string) {
  const gw = await gateway();
  return tx(async (c) => {
    const { rows } = await c.query<PaymentRow>("select * from app.payments where video_order_id = $1 for update", [orderId]);
    const p = rows[0];
    if (!p) return { released: false, reason: "no_payment" };
    if (p.status === "captured" || p.status === "refunded") return { released: true };
    if (p.status === "authorized" && p.stripe_payment_intent_id) {
      const cap = await gw.capture(p.stripe_payment_intent_id, `capture:${p.id}:${p.stripe_payment_intent_id}`);
      if (cap.ok) {
        await c.query("update app.payments set status = 'captured', stripe_charge_id = $2, last_error = null, updated_at = now() where id = $1", [p.id, cap.chargeId]);
        return { released: true };
      }
      await c.query("update app.payments set status = 'capture_failed', last_error = $2, updated_at = now() where id = $1", [p.id, `${cap.code}: ${cap.message}`.slice(0, 300)]);
    }
    if (p.stripe_customer_id && p.stripe_payment_method_id) {
      const ch = await gw.chargeOffSession({
        customer: p.stripe_customer_id,
        paymentMethod: p.stripe_payment_method_id,
        amountCents: p.amount_cents,
        idempotencyKey: `charge:${p.id}`,
        metadata: { kind: "video_charge", video_order_id: orderId },
      });
      if (ch.ok) {
        await c.query("update app.payments set status = 'captured', stripe_payment_intent_id = $2, last_error = null, updated_at = now() where id = $1", [p.id, ch.paymentIntentId]);
        return { released: true };
      }
      await c.query("update app.payments set status = 'action_required', last_error = $2, updated_at = now() where id = $1", [p.id, `${ch.code}: ${ch.message}`.slice(0, 300)]);
    }
    return { released: false, reason: "payment_action_required" };
  });
}

/** Customer fixes a failed authorization/charge on-session (bank can ask for 3-D Secure). */
export async function startVideoPaymentFix(hug: { id: string; token: string }) {
  const gw = await gateway();
  const o = await one<{ id: string; status: string }>("select id, status from app.video_orders where hug_id = $1 and status in ('booked', 'recording', 'ready')", [hug.id]);
  if (!o) throw new AppError("not_found");
  const p = await paymentForOrder(o.id);
  if (!p || !["action_required", "capture_failed"].includes(p.status)) throw new AppError("bad_transition");
  const recorded = o.status === "ready";
  const session = await gw.createPaymentCheckout({
    amountCents: p.amount_cents,
    name: "Founder Video Word Hug",
    description: recorded ? "Your video is recorded and waiting." : "Authorizes $15. You're charged only after your video is uploaded.",
    successUrl: `${appUrl()}/h/${hug.token}?video_checkout={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${appUrl()}/h/${hug.token}?video_checkout=canceled`,
    metadata: { kind: "video_pay", video_order_id: o.id, hug_id: hug.id },
    expiresAt: minutes(60),
    // Before recording: authorize only. After recording: the video exists, so charge.
    captureMethod: recorded ? "automatic" : "manual",
    customer: p.stripe_customer_id ?? undefined,
    idempotencyKey: `video-pay:${p.id}:${Date.now()}`,
  });
  return { checkoutUrl: session.url };
}

/** Releases any authorization when an order is cancelled. */
export async function releaseAuthorization(orderId: string) {
  const gw = await gateway();
  const p = await paymentForOrder(orderId);
  if (p?.status === "authorized" && p.stripe_payment_intent_id) {
    await gw.cancelPaymentIntent(p.stripe_payment_intent_id, `cancel:${p.id}`);
    await q("update app.payments set status = 'canceled', updated_at = now() where id = $1 and status = 'authorized'", [p.id]);
  }
  // Abandon any open checkout for a held slot.
  const o = await one<{ checkout_session_id: string | null }>("select checkout_session_id from app.video_orders where id = $1", [orderId]);
  if (o?.checkout_session_id) await gw.expireCheckout(o.checkout_session_id).catch(() => undefined);
}

export async function refundVideo(orderId: string, reason: string) {
  const gw = await gateway();
  const p = await paymentForOrder(orderId);
  if (!p || p.status !== "captured" || !p.stripe_payment_intent_id) throw new AppError("bad_transition");
  await gw.refund({ paymentIntentId: p.stripe_payment_intent_id, idempotencyKey: `refund:${p.id}` });
  await q("update app.payments set status = 'refunded', refunded_cents = amount_cents, last_error = $2, updated_at = now() where id = $1 and status = 'captured'", [
    p.id,
    `refunded: ${reason}`.slice(0, 300),
  ]);
}

// ------------------------------------------------------------ confirmation (webhook + return page)

/**
 * Reconciles a Checkout Session with our records. Safe to call any number of
 * times, in any order, from the webhook or the customer's return page.
 */
export async function reconcileCheckout(sessionId: string) {
  const gw = await gateway();
  const s = await gw.getCheckout(sessionId);
  const kind = s.metadata.kind;

  if (kind === "hug") {
    const draft = await draftBySession(s.id);
    if (!draft) return { kind, state: "unknown" as const };
    if (s.status === "expired") {
      await closeDraft(draft.id, "expired");
      return { kind, state: "expired" as const };
    }
    if (s.status !== "complete" || s.paymentStatus !== "paid") return { kind, state: "pending" as const };
    const r = await finalizeDraft(draft.id, { provider: gw.kind, sessionId: s.id, paymentIntentId: s.paymentIntent, customer: s.customer, amountCents: s.amountTotal ?? 0 });
    return { kind, state: "paid" as const, token: r.token, headline: r.headline, draftId: draft.id };
  }

  const orderId = s.metadata.video_order_id;
  if (!orderId) return { kind, state: "unknown" as const };

  if (kind === "video_setup") {
    if (s.status === "expired") {
      const o = await one<{ status: string; hold_kind: string | null }>("select status, hold_kind from app.video_orders where id = $1 and checkout_session_id = $2", [orderId, s.id]);
      if (o?.status === "held" && o.hold_kind === "checkout") await wrap(q("select app.cancel_video($1, 'system', 'Checkout not completed')", [orderId]));
      return { kind, state: "expired" as const };
    }
    if (s.status !== "complete" || !s.setupIntent) return { kind, state: "pending" as const };
    const si = await gw.getSetupPaymentMethod(s.setupIntent);
    if (si.status !== "succeeded" || !si.paymentMethod) return { kind, state: "pending" as const };
    try {
      await wrap(q("select app.confirm_video_booking($1, $2, $3, $4, $5)", [orderId, gw.kind, si.customer ?? s.customer, si.paymentMethod, s.setupIntent]));
      return { kind, state: "booked" as const };
    } catch (e) {
      // Card saved but the slot is gone (hold expired). Nothing was charged.
      if (e instanceof AppError && e.code === "hold_expired") return { kind, state: "hold_expired" as const };
      // The hug (and its order) was deleted meanwhile: nothing to do, acknowledge.
      if (e instanceof AppError && e.code === "not_found") return { kind, state: "gone" as const };
      throw e;
    }
  }

  if (kind === "video_pay") {
    if (s.status !== "complete" || !s.paymentIntent) return { kind, state: "pending" as const };
    const pi = await gw.getPaymentIntent(s.paymentIntent);
    const status = pi.status === "succeeded" ? "captured" : pi.status === "requires_capture" ? "authorized" : null;
    if (status) {
      await q(
        `update app.payments set status = $2, stripe_payment_intent_id = $3, last_error = null, updated_at = now()
          where video_order_id = $1 and status in ('action_required', 'capture_failed')`,
        [orderId, status, pi.id],
      );
    }
    return { kind, state: (status ?? "pending") as string };
  }
  return { kind, state: "unknown" as const };
}

// ------------------------------------------------------------ webhooks

type Obj = Record<string, unknown> & { id: string; metadata?: Record<string, string> };

/**
 * Processes a verified Stripe event exactly once. Duplicates (Stripe retries,
 * replays) are acknowledged without side effects; failures throw so Stripe
 * retries; handlers are state-guarded so out-of-order delivery is harmless.
 */
export async function handleWebhook(evt: Stripe.Event) {
  const ins = await one<{ processed_at: Date | null }>(
    `insert into app.stripe_events (id, type, payload) values ($1, $2, $3)
     on conflict (id) do update set id = excluded.id returning processed_at`,
    [evt.id, evt.type, evt as unknown as object],
  );
  if (ins?.processed_at) return { duplicate: true };

  const o = evt.data.object as unknown as Obj;
  const byPi = async (sql: string, params: unknown[]) => q(sql, params);

  switch (evt.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded":
    case "checkout.session.expired":
      await reconcileCheckout(o.id);
      break;
    case "payment_intent.amount_capturable_updated":
      await byPi(
        `update app.payments set status = 'authorized', last_error = null, updated_at = now()
          where stripe_payment_intent_id = $1 and status in ('method_saved', 'action_required', 'pending')`,
        [o.id],
      );
      break;
    case "payment_intent.succeeded":
      await byPi(
        `update app.payments set status = 'captured', last_error = null, updated_at = now()
          where stripe_payment_intent_id = $1 and status in ('authorized', 'capture_failed', 'action_required', 'pending', 'method_saved')`,
        [o.id],
      );
      break;
    case "payment_intent.payment_failed":
      await byPi(
        `update app.payments set status = 'action_required', last_error = 'payment_failed', updated_at = now()
          where stripe_payment_intent_id = $1 and status in ('method_saved', 'authorized', 'pending')`,
        [o.id],
      );
      break;
    case "payment_intent.canceled":
      await byPi(
        `update app.payments set status = 'canceled', updated_at = now()
          where stripe_payment_intent_id = $1 and status = 'authorized'
            and exists (select 1 from app.video_orders v where v.id = video_order_id and v.status = 'canceled')`,
        [o.id],
      );
      break;
    case "charge.refunded": {
      const amountRefunded = Number(o.amount_refunded ?? 0);
      await byPi(
        `update app.payments set refunded_cents = least(amount_cents, $2),
                status = case when $2 >= amount_cents then 'refunded'::app.payment_status else status end, updated_at = now()
          where stripe_payment_intent_id = $1 and status in ('captured', 'refunded', 'disputed')`,
        [o.payment_intent, amountRefunded],
      );
      break;
    }
    case "charge.dispute.created":
      // A disputed video is withheld from viewers until the dispute is resolved.
      await byPi(`update app.payments set status = 'disputed', last_error = 'dispute opened', updated_at = now() where stripe_payment_intent_id = $1 and status in ('captured', 'refunded')`, [o.payment_intent]);
      break;
    case "charge.dispute.closed": {
      const won = o.status === "won";
      await byPi(
        `update app.payments set status = $2::app.payment_status, last_error = $3, updated_at = now() where stripe_payment_intent_id = $1 and status = 'disputed'`,
        [o.payment_intent, won ? "captured" : "refunded", won ? "dispute won" : "dispute lost"],
      );
      break;
    }
    default:
      break; // acknowledged, ignored
  }
  await q("update app.stripe_events set processed_at = now() where id = $1", [evt.id]);
  return { duplicate: false };
}
