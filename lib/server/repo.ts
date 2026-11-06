// Word Hug data access. Every read/write of customer data goes through here.
// Callers (API routes, pages) must already have checked the relevant
// capability: a gift-link token, an owner key, or a studio session.

import { compose, cleanInterests, cleanName } from "../composer/index.ts";
import { CATEGORY_INFO, OCCASION_INFO, TONE_INFO, type Category, type Intensity, type Occasion, type Tone } from "../catalog";
import { CONSENT_TEXT, CONSENT_VERSION, PHOTO_DAYS } from "../privacy";
import type { OwnerState, OwnerVideoView, PublicHug, StudioDay, StudioOrder, VideoStatus } from "../types";
import { AppError, dbCode, one, q, tx } from "./db";
import { hashKey, newOwnerKey, newToken, verifyOwner } from "./ids";
import {
  PHOTO_BUCKET,
  PHOTO_LINK_SECONDS,
  VIDEO_BUCKET,
  VIDEO_LINK_SECONDS,
  putPhoto,
  removeObjects,
  signedUploadUrl,
  signedViewUrl,
  sniffImage,
} from "./media";

const PHOTO_EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" } as const;
const VIDEO_EXT: Record<string, string> = { "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm" };
const TOKEN_RE = /^[A-Za-z0-9_-]{16,64}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type HugRow = {
  id: string;
  token: string;
  owner_key_hash: string;
  customer_id: string | null;
  for_self: boolean;
  recipient_name: string;
  sender_name: string;
  category: Category;
  tone: Tone;
  intensity: Intensity;
  occasion: Occasion | null;
  interests: string[];
  headline: string;
  kicker: string;
  paragraphs: string[];
  line_ids: string[];
  revisions: number;
  created_at: Date;
};

/** SQL predicate: a delivered video may only be released once paid (see M3 payments). */
const RELEASED = "exists (select 1 from app.payments p where p.video_order_id = app.video_orders.id and p.status in ('captured', 'refunded'))";

export type StudioSettingsView = {
  defaultCapacity: number; paused: boolean; today: string; cutoffHour: number; weekdays: number[];
  holdHours: number; windowDays: number; timezone: string; retentionDays: number;
};

const day = (d: Date | string) => (typeof d === "string" ? d.slice(0, 10) : d.toISOString().slice(0, 10));

// ---------------------------------------------------------------- rate limits

export async function rateLimit(key: string, limit: number, windowSeconds: number) {
  const r = await one<{ ok: boolean }>("select app.hit_rate_limit($1, $2, $3) as ok", [key, limit, windowSeconds]);
  return Boolean(r?.ok);
}

// ---------------------------------------------------------------- hugs

export type CreateHugInput = {
  forSelf: boolean;
  category: Category;
  tone: Tone;
  intensity: Intensity;
  recipientName?: string;
  senderName?: string;
  occasion?: Occasion;
  interests?: string[];
  avoid?: string[];
  photo?: { bytes: Uint8Array; consent: boolean; allowForVideo: boolean } | null;
};

type DraftInput = Omit<CreateHugInput, "photo">;

/**
 * Step 1 of a prepaid written hug: store the customer's choices as a DRAFT
 * (not an order) while they pay. The owner key is returned to the device now
 * and only its hash is stored. Nothing is composed or delivered yet.
 */
export async function createDraft(input: CreateHugInput) {
  const clean: DraftInput = {
    forSelf: input.forSelf,
    category: input.category,
    tone: input.tone,
    intensity: input.intensity,
    recipientName: cleanName(input.recipientName),
    senderName: input.forSelf ? "" : cleanName(input.senderName),
    occasion: input.occasion,
    interests: cleanInterests(input.interests),
    avoid: (input.avoid ?? []).slice(0, 60),
  };
  const ownerKey = newOwnerKey();
  let photoPath: string | null = null;
  let photoMime: keyof typeof PHOTO_EXT | null = null;
  if (input.photo) {
    if (!input.photo.consent) throw new AppError("consent_required");
    photoMime = sniffImage(input.photo.bytes);
    if (!photoMime) throw new AppError("bad_photo");
    if (input.photo.bytes.byteLength > 8 * 1024 * 1024) throw new AppError("photo_too_large");
    photoPath = `${newToken()}.${PHOTO_EXT[photoMime]}`;
    await putPhoto(photoPath, input.photo.bytes, photoMime);
  }
  try {
    const d = await one<{ id: string }>(
      `insert into app.hug_drafts (owner_key_hash, input, photo_path, photo_mime, photo_bytes, photo_allow_for_video)
       values ($1, $2, $3, $4, $5, $6) returning id`,
      [hashKey(ownerKey), clean, photoPath, photoMime, input.photo?.bytes.byteLength ?? null, Boolean(input.photo?.allowForVideo)],
    );
    return { draftId: d!.id, ownerKey, recipientName: clean.recipientName ?? "" };
  } catch (e) {
    await removeObjects(PHOTO_BUCKET, [photoPath]).catch(() => undefined);
    throw e;
  }
}

export async function attachDraftCheckout(draftId: string, sessionId: string) {
  await q("update app.hug_drafts set checkout_session_id = $2 where id = $1 and status = 'pending'", [draftId, sessionId]);
}

/**
 * Step 2, only after the $1 payment is confirmed by the gateway: compose and
 * create the hug, its photo record and the payment record — atomically and
 * idempotently (webhook retries, the return page and duplicates all converge).
 */
export async function finalizeDraft(
  draftId: string,
  pay: { provider: "fake" | "stripe"; sessionId: string; paymentIntentId: string | null; customer: string | null; amountCents: number },
) {
  return tx(async (c) => {
    const { rows } = await c.query<{
      id: string; owner_key_hash: string; input: DraftInput; photo_path: string | null; photo_mime: string | null; photo_bytes: number | null;
      photo_allow_for_video: boolean; status: string; hug_id: string | null; created_at: Date;
    }>("select * from app.hug_drafts where id = $1 for update", [draftId]);
    const d = rows[0];
    if (!d) throw new AppError("not_found");
    if (d.status === "paid" && d.hug_id) {
      const h = await c.query<{ token: string; headline: string }>("select token, headline from app.hugs where id = $1", [d.hug_id]);
      return { token: h.rows[0].token, headline: h.rows[0].headline, duplicate: true };
    }
    if (d.status !== "pending") throw new AppError("draft_closed");
    const product = await c.query<{ amount_cents: number }>("select amount_cents from app.products where sku = 'hug_written'");
    if (pay.amountCents < product.rows[0].amount_cents) throw new AppError("underpaid");

    const i = d.input;
    const seed = Math.floor(Math.random() * 2 ** 31);
    const content = compose({ category: i.category, tone: i.tone, intensity: i.intensity, name: i.recipientName, interests: i.interests, occasion: i.occasion, avoid: i.avoid, seed });
    const token = newToken();
    const h = await c.query<{ id: string }>(
      `insert into app.hugs (token, owner_key_hash, for_self, recipient_name, sender_name, category, tone, intensity,
                             occasion, interests, seed, headline, kicker, paragraphs, line_ids)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) returning id`,
      [token, d.owner_key_hash, i.forSelf, i.recipientName ?? "", i.senderName ?? "", i.category, i.tone, i.intensity,
       i.occasion ?? null, i.interests ?? [], seed, content.headline, content.kicker, content.paragraphs, content.lineIds],
    );
    const hugId = h.rows[0].id;
    await c.query(
      `insert into app.payments (sku, hug_id, draft_id, provider, amount_cents, status, stripe_checkout_session_id, stripe_payment_intent_id, stripe_customer_id)
       values ('hug_written', $1, $2, $3, $4, 'captured', $5, $6, $7)`,
      [hugId, d.id, pay.provider, pay.amountCents, pay.sessionId, pay.paymentIntentId, pay.customer],
    );
    if (d.photo_path && d.photo_mime && d.photo_bytes) {
      await c.query(
        `insert into app.hug_photos (hug_id, storage_path, mime, bytes, consent_at, consent_text, consent_version, allow_for_video, expires_at)
         values ($1, $2, $3, $4, $5::timestamptz, $6, $7, $8, $5::timestamptz + make_interval(days => $9::int))`,
        [hugId, d.photo_path, d.photo_mime, d.photo_bytes, d.created_at, CONSENT_TEXT, CONSENT_VERSION, d.photo_allow_for_video, PHOTO_DAYS],
      );
    }
    await c.query("update app.hug_drafts set status = 'paid', hug_id = $2 where id = $1", [d.id, hugId]);
    return { token, headline: content.headline, duplicate: false };
  });
}

/** Abandoned or expired checkout: close the draft and delete its photo. */
export async function closeDraft(draftId: string, status: "expired" | "canceled") {
  const d = await one<{ photo_path: string | null }>(
    "update app.hug_drafts set status = $2 where id = $1 and status = 'pending' returning photo_path",
    [draftId, status],
  );
  if (d?.photo_path) await removeObjects(PHOTO_BUCKET, [d.photo_path]).catch(() => undefined);
}

export async function draftBySession(sessionId: string) {
  return one<{ id: string; status: string }>("select id, status from app.hug_drafts where checkout_session_id = $1", [sessionId]);
}

async function hugByToken(token: string) {
  if (!TOKEN_RE.test(token)) return null;
  return one<HugRow>("select * from app.hugs where token = $1", [token]);
}

/** Gift-link view. The token is the capability. */
export async function getPublicHug(token: string): Promise<PublicHug | null> {
  const h = await hugByToken(token);
  if (!h) return null;
  const extra = await one<{ has_photo: boolean; video_expires_at: Date | null }>(
    `select exists (select 1 from app.hug_photos where hug_id = $1) as has_photo,
            (select video_expires_at from app.video_orders
              where hug_id = $1 and status = 'ready' and video_expires_at > now() and ${RELEASED}) as video_expires_at`,
    [h.id],
  );
  return {
    token: h.token,
    createdAt: h.created_at.toISOString(),
    forSelf: h.for_self,
    recipientName: h.recipient_name,
    senderName: h.sender_name,
    category: h.category,
    content: { headline: h.headline, kicker: h.kicker, paragraphs: h.paragraphs },
    hasPhoto: Boolean(extra?.has_photo),
    videoReady: Boolean(extra?.video_expires_at),
    videoExpiresAt: extra?.video_expires_at?.toISOString() ?? null,
  };
}

/** Owner check: the owner key (held only on the creator's device) must match. */
export async function ownedHug(token: string, ownerKey: string | null): Promise<HugRow> {
  const h = await hugByToken(token);
  if (!h) throw new AppError("not_found");
  if (!verifyOwner(ownerKey, h.owner_key_hash)) throw new AppError("forbidden");
  return h;
}

async function videoView(hugId: string): Promise<OwnerVideoView | null> {
  const v = await one<{
    id: string; status: VideoStatus; recording_day: Date; hold_expires_at: Date | null; note: string;
    canceled_reason: string | null; pos: number | null; video_expires_at: Date | null; hold_kind: string | null; pay_status: string | null;
  }>(
    `select o.id, o.status, o.recording_day, o.hold_expires_at, o.note, o.canceled_reason, o.video_expires_at, o.hold_kind,
            (select p.status::text from app.payments p where p.video_order_id = o.id) as pay_status,
            case when o.status = 'booked' then (
              select count(*)::int from app.video_orders x
               where x.recording_day = o.recording_day and x.status = 'booked' and x.created_at <= o.created_at)
            end as pos
       from app.video_orders o where o.hug_id = $1
      order by (o.status <> 'canceled') desc, o.created_at desc limit 1`,
    [hugId],
  );
  if (!v) return null;
  return {
    id: v.id,
    status: v.status,
    recordingDay: day(v.recording_day),
    holdExpiresAt: v.hold_expires_at?.toISOString() ?? null,
    positionInDay: v.pos,
    videoExpiresAt: v.video_expires_at?.toISOString() ?? null,
    holdKind: (v.hold_kind as "checkout" | "waitlist" | null) ?? null,
    payment: v.pay_status,
    note: v.note,
    canceledReason: v.canceled_reason,
  };
}

export async function ownerState(h: HugRow): Promise<OwnerState> {
  await q("select app.expire_holds()");
  const [video, wl, next, settings, photo] = await Promise.all([
    videoView(h.id),
    one<{ status: "waiting" | "offered"; created_at: Date }>(
      "select status, created_at from app.video_waitlist where hug_id = $1 and status in ('waiting','offered')",
      [h.id],
    ),
    one<{ day: Date; remaining: number }>("select * from app.next_available_day()"),
    one<{ paused: boolean; today: Date }>("select paused, app.studio_today() as today from app.settings"),
    one<{ allow_for_video: boolean; expires_at: Date }>("select allow_for_video, expires_at from app.hug_photos where hug_id = $1", [h.id]),
  ]);
  return {
    video,
    waitlist: wl ? { status: wl.status, joinedAt: wl.created_at.toISOString() } : null,
    nextAvailable: next ? { day: day(next.day), remaining: next.remaining } : null,
    paused: Boolean(settings?.paused),
    today: settings ? day(settings.today) : "",
    photo: photo ? { allowForVideo: photo.allow_for_video, expiresAt: photo.expires_at.toISOString() } : null,
    revisions: h.revisions,
    hasRecoveryEmail: Boolean(h.customer_id),
  };
}

export async function rerollHug(h: HugRow, avoid: string[]) {
  return tx(async (c) => {
    const { rows } = await c.query<HugRow>("select * from app.hugs where id = $1 for update", [h.id]);
    const cur = rows[0];
    if (!cur) throw new AppError("not_found");
    const locked = await c.query("select 1 from app.video_orders where hug_id = $1 and status <> 'canceled'", [h.id]);
    if (locked.rowCount) throw new AppError("locked");
    if (cur.revisions >= 25) throw new AppError("limit");
    const seed = Math.floor(Math.random() * 2 ** 31);
    const content = compose({
      category: cur.category,
      tone: cur.tone,
      intensity: cur.intensity,
      name: cur.recipient_name,
      interests: cur.interests,
      occasion: cur.occasion ?? undefined,
      avoid: [...avoid.slice(0, 80), ...cur.line_ids],
      seed,
    });
    await c.query(
      "update app.hugs set seed=$2, headline=$3, kicker=$4, paragraphs=$5, line_ids=$6, revisions=revisions+1 where id=$1",
      [h.id, seed, content.headline, content.kicker, content.paragraphs, content.lineIds],
    );
    return content;
  });
}

/** Permanent deletion. Access ends at the DB delete; objects are removed right after. */
export async function deleteHug(h: HugRow) {
  const media = await q<{ photo: string | null; video: string | null }>(
    `select (select storage_path from app.hug_photos where hug_id = $1) as photo, v.video_path as video
       from (select 1) x left join app.video_orders v on v.hug_id = $1`,
    [h.id],
  );
  await q("delete from app.hugs where id = $1", [h.id]);
  await removeObjects(PHOTO_BUCKET, [media[0]?.photo]).catch(() => undefined); // orphan sweeper retries
  await removeObjects(VIDEO_BUCKET, media.map((m) => m.video)).catch(() => undefined);
}

export async function deletePhoto(hugId: string) {
  const row = await one<{ storage_path: string }>("delete from app.hug_photos where hug_id = $1 returning storage_path", [hugId]);
  if (row) await removeObjects(PHOTO_BUCKET, [row.storage_path]).catch(() => undefined);
  return Boolean(row);
}

export async function photoLink(token: string) {
  const h = await hugByToken(token);
  if (!h) return null;
  const p = await one<{ storage_path: string }>("select storage_path from app.hug_photos where hug_id = $1", [h.id]);
  return p ? signedViewUrl(PHOTO_BUCKET, p.storage_path, PHOTO_LINK_SECONDS) : null;
}

export async function videoLink(token: string, download = false) {
  const h = await hugByToken(token);
  if (!h) return null;
  const v = await one<{ video_path: string; video_mime: string }>(
    `select video_path, video_mime from app.video_orders
      where hug_id = $1 and status = 'ready' and video_path is not null and video_expires_at > now() and ${RELEASED}`,
    [h.id],
  );
  if (!v) return null;
  const ext = v.video_mime === "video/quicktime" ? "mov" : v.video_mime === "video/webm" ? "webm" : "mp4";
  return signedViewUrl(VIDEO_BUCKET, v.video_path, VIDEO_LINK_SECONDS, download ? `word-hug.${ext}` : undefined);
}

// ---------------------------------------------------------------- video booking

async function wrap<T>(p: Promise<T>) {
  try {
    return await p;
  } catch (e) {
    const code = dbCode(e);
    if (code) throw new AppError(code);
    throw e;
  }
}

export async function cancelVideoByCustomer(hugId: string) {
  const v = await one<{ id: string }>("select id from app.video_orders where hug_id = $1 and status not in ('canceled', 'expired')", [hugId]);
  if (!v) throw new AppError("not_found");
  await wrap(q("select app.cancel_video($1, 'customer', 'Cancelled by you')", [v.id]));
}

export const joinWaitlist = (hugId: string, note: string) => wrap(q("select app.join_waitlist($1, $2)", [hugId, note.slice(0, 400)]));
export const leaveWaitlist = (hugId: string) => wrap(q("select app.leave_waitlist($1)", [hugId]));

export async function publicAvailability() {
  const [next, s] = await Promise.all([
    one<{ day: Date; remaining: number }>("select * from app.next_available_day()"),
    one<{ paused: boolean; today: Date; cap: number }>("select paused, app.studio_today() as today, default_daily_capacity as cap from app.settings"),
  ]);
  return {
    paused: Boolean(s?.paused),
    today: s ? day(s.today) : null,
    capacity: s?.cap ?? 0,
    next: next ? { day: day(next.day), remaining: next.remaining } : null,
  };
}

// ---------------------------------------------------------------- recovery

export async function attachEmail(hugId: string, email: string) {
  const e = email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e) || e.length > 254) throw new AppError("bad_email");
  await tx(async (c) => {
    const { rows } = await c.query<{ id: string }>(
      `insert into app.customers (email) values ($1) on conflict (email) do update set email = excluded.email returning id`,
      [e],
    );
    await c.query("update app.hugs set customer_id = $2 where id = $1", [hugId, rows[0].id]);
  });
}

/** Returns a raw one-time token to email, or null if there's nothing to recover (caller must not reveal which). */
export async function createRecoveryToken(email: string) {
  const c = await one<{ id: string }>(
    "select c.id from app.customers c where c.email = $1 and exists (select 1 from app.hugs h where h.customer_id = c.id)",
    [email.trim().toLowerCase()],
  );
  if (!c) return null;
  const raw = newToken() + newToken();
  await q("insert into app.recovery_tokens (customer_id, token_hash, expires_at) values ($1, $2, now() + interval '30 minutes')", [c.id, hashKey(raw)]);
  return raw;
}

/** Redeems a recovery token once. Rotates every owner key so a lost device loses control. */
export async function redeemRecoveryToken(raw: string) {
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(raw)) throw new AppError("bad_token");
  return tx(async (c) => {
    const { rows } = await c.query<{ id: string; customer_id: string }>(
      `update app.recovery_tokens set used_at = now()
        where token_hash = $1 and used_at is null and expires_at > now()
        returning id, customer_id`,
      [hashKey(raw)],
    );
    if (!rows[0]) throw new AppError("bad_token");
    await c.query("update app.customers set email_verified_at = coalesce(email_verified_at, now()) where id = $1", [rows[0].customer_id]);
    const hugs = await c.query<{ id: string; token: string; headline: string; created_at: Date; for_self: boolean; recipient_name: string }>(
      "select id, token, headline, created_at, for_self, recipient_name from app.hugs where customer_id = $1 order by created_at desc limit 100",
      [rows[0].customer_id],
    );
    const out = [];
    for (const h of hugs.rows) {
      const key = newOwnerKey();
      await c.query("update app.hugs set owner_key_hash = $2 where id = $1", [h.id, hashKey(key)]);
      out.push({ token: h.token, ownerKey: key, headline: h.headline, createdAt: h.created_at.toISOString(), forSelf: h.for_self, recipientName: h.recipient_name });
    }
    return out;
  });
}

// ---------------------------------------------------------------- studio

export async function createStudioSession(userId: string) {
  const raw = newToken() + newToken();
  await q(
    "insert into app.studio_sessions (token_hash, user_id, aal, expires_at) values ($1, $2, 'aal2', now() + interval '12 hours')",
    [hashKey(raw), userId],
  );
  return raw;
}

export type StaffMember = { userId: string; email: string; role: string };

/** Active staff member if this is a live studio session; null otherwise. */
export async function checkStudioSession(raw: string | undefined): Promise<StaffMember | null> {
  if (!raw || !/^[A-Za-z0-9_-]{32,128}$/.test(raw)) return null;
  const r = await one<{ user_id: string; email: string; role: string }>(
    `select s.user_id, st.email::text, st.role from app.studio_sessions s
       join app.staff st on st.user_id = s.user_id and st.disabled_at is null
      where s.token_hash = $1 and s.revoked_at is null and s.expires_at > now()`,
    [hashKey(raw)],
  );
  return r ? { userId: r.user_id, email: r.email, role: r.role } : null;
}

export async function activeStaff(userId: string) {
  return one<{ user_id: string }>("select user_id from app.staff where user_id = $1 and disabled_at is null", [userId]);
}

export async function revokeStudioSession(raw: string | undefined) {
  if (raw) await q("update app.studio_sessions set revoked_at = now() where token_hash = $1", [hashKey(raw)]);
}

export async function studioOverview(): Promise<{ orders: StudioOrder[]; days: StudioDay[]; settings: StudioSettingsView; waitlist: number }> {
  await q("select app.expire_holds()");
  const rows = await q<{
    id: string; created_at: Date; recording_day: Date; status: VideoStatus; hold_expires_at: Date | null; note: string; demo: boolean;
    canceled_reason: string | null; video_path: string | null; amount_cents: number | null; pay_status: string | null;
    token: string; recipient_name: string; sender_name: string; for_self: boolean; category: Category; tone: Tone; intensity: Intensity;
    occasion: Occasion | null; interests: string[]; headline: string; paragraphs: string[]; photo_ok: boolean;
    history: { status: string; at: string; actor: string }[];
  }>(
    `select o.*, h.token, h.recipient_name, h.sender_name, h.for_self, h.category, h.tone, h.intensity, h.occasion, h.interests,
            h.headline, h.paragraphs,
            exists (select 1 from app.hug_photos p where p.hug_id = h.id and p.allow_for_video) as photo_ok,
            p.amount_cents, p.status::text as pay_status,
            coalesce((select json_agg(json_build_object('status', e.status, 'at', e.at, 'actor', e.actor) order by e.at)
                        from app.video_status_events e where e.order_id = o.id), '[]') as history
       from app.video_orders o
       join app.hugs h on h.id = o.hug_id
       left join lateral (select amount_cents, status from app.payments where video_order_id = o.id order by created_at desc limit 1) p on true
      where o.status <> 'canceled' or o.updated_at > now() - interval '14 days'
      order by o.recording_day, o.created_at`,
  );
  const [days, settings, wl] = await Promise.all([
    q<{ day: Date; capacity: number; closed: boolean; used: number }>(
      `select d.day, d.capacity, d.closed, app.active_count(d.day) as used from app.recording_days d
        where d.day >= app.studio_today() order by d.day limit 14`,
    ),
    one<{ default_daily_capacity: number; paused: boolean; today: Date; same_day_cutoff_hour: number; recording_weekdays: number[]; waitlist_hold_hours: number; booking_horizon_days: number; timezone: string; video_retention_days: number }>(
      "select *, app.studio_today() as today from app.settings",
    ),
    one<{ n: number }>("select count(*)::int as n from app.video_waitlist where status = 'waiting'"),
  ]);
  return {
    orders: rows.map((r) => ({
      id: r.id,
      createdAt: r.created_at.toISOString(),
      recordingDay: day(r.recording_day),
      status: r.status,
      holdExpiresAt: r.hold_expires_at?.toISOString() ?? null,
      history: r.history,
      note: r.note,
      demo: r.demo,
      amountCents: r.amount_cents ?? 0,
      paymentStatus: r.pay_status ?? "none",
      canceledReason: r.canceled_reason,
      hasVideo: Boolean(r.video_path),
      hug: {
        token: r.token,
        recipientName: r.recipient_name,
        senderName: r.sender_name,
        forSelf: r.for_self,
        kind: CATEGORY_INFO[r.category].label,
        tone: `${TONE_INFO[r.tone].label} · ${CATEGORY_INFO[r.category].intensity[r.intensity - 1]}`,
        occasion: r.occasion ? OCCASION_INFO[r.occasion] : undefined,
        interests: r.interests,
        headline: r.headline,
        paragraphs: r.paragraphs,
        photoForVideo: r.photo_ok,
      },
    })),
    days: days.map((d) => ({ day: day(d.day), capacity: d.capacity, closed: d.closed, used: d.used })),
    settings: {
      defaultCapacity: settings?.default_daily_capacity ?? 5,
      paused: Boolean(settings?.paused),
      today: settings ? day(settings.today) : "",
      cutoffHour: settings?.same_day_cutoff_hour ?? 17,
      weekdays: settings?.recording_weekdays ?? [1, 2, 3, 4, 5],
      holdHours: settings?.waitlist_hold_hours ?? 24,
      windowDays: settings?.booking_horizon_days ?? 7,
      timezone: settings?.timezone ?? "America/Denver",
      retentionDays: settings?.video_retention_days ?? 30,
    },
    waitlist: wl?.n ?? 0,
  };
}

function assertUuid(id: string) {
  if (!UUID_RE.test(id)) throw new AppError("not_found");
}

export async function studioSetRecording(orderId: string, recording: boolean) {
  assertUuid(orderId);
  const old = await one<{ video_path: string | null; status: VideoStatus }>("select video_path, status from app.video_orders where id = $1", [orderId]);
  await wrap(q("select app.set_recording($1, $2)", [orderId, recording]));
  // Re-recording a ready video: the old file is no longer referenced; delete it.
  if (old?.status === "ready" && old.video_path) await removeObjects(VIDEO_BUCKET, [old.video_path]).catch(() => undefined);
}

export async function studioCancel(orderId: string, reason: string) {
  assertUuid(orderId);
  await wrap(q("select app.cancel_video($1, 'studio', $2)", [orderId, reason.slice(0, 200)]));
}

export async function studioUploadUrl(orderId: string, mime: string) {
  assertUuid(orderId);
  const ext = VIDEO_EXT[mime];
  if (!ext) throw new AppError("bad_video_type");
  const o = await one<{ status: VideoStatus }>("select status from app.video_orders where id = $1", [orderId]);
  if (!o) throw new AppError("not_found");
  if (o.status !== "recording") throw new AppError("bad_transition");
  return signedUploadUrl(`${newToken()}.${ext}`);
}

export async function studioFinalize(orderId: string, path: string, durationSeconds?: number) {
  assertUuid(orderId);
  if (!/^[A-Za-z0-9_-]+\.(mp4|mov|webm)$/.test(path)) throw new AppError("upload_missing");
  const dur = typeof durationSeconds === "number" && Number.isFinite(durationSeconds) ? Math.min(600, Math.max(0, durationSeconds)) : null;
  await wrap(q("select app.mark_video_ready($1, $2, $3)", [orderId, path, dur]));
}

export async function studioPhotoLink(orderId: string) {
  assertUuid(orderId);
  const r = await one<{ path: string | null }>("select app.studio_photo_path($1) as path", [orderId]);
  return r?.path ? signedViewUrl(PHOTO_BUCKET, r.path, PHOTO_LINK_SECONDS) : null;
}

export async function studioVideoLink(orderId: string) {
  assertUuid(orderId);
  const r = await one<{ video_path: string | null }>("select video_path from app.video_orders where id = $1 and status = 'ready'", [orderId]);
  return r?.video_path ? signedViewUrl(VIDEO_BUCKET, r.video_path, VIDEO_LINK_SECONDS) : null;
}

export async function studioSettings(s: { defaultCapacity?: number; paused?: boolean; cutoffHour?: number; weekdays?: number[]; holdHours?: number }) {
  if (typeof s.cutoffHour === "number") {
    await q("update app.settings set same_day_cutoff_hour = $1, updated_at = now()", [Math.max(0, Math.min(24, Math.round(s.cutoffHour)))]);
  }
  if (Array.isArray(s.weekdays)) {
    const days = [...new Set(s.weekdays.map(Number).filter((d) => Number.isInteger(d) && d >= 1 && d <= 7))].sort();
    await q("update app.settings set recording_weekdays = $1, updated_at = now()", [days]);
  }
  if (typeof s.holdHours === "number") {
    await q("update app.settings set waitlist_hold_hours = $1, updated_at = now()", [Math.max(1, Math.min(24, Math.round(s.holdHours)))]);
  }
  if (typeof s.defaultCapacity === "number") {
    const cap = Math.max(0, Math.min(50, Math.round(s.defaultCapacity)));
    await q("update app.settings set default_daily_capacity = $1, updated_at = now()", [cap]);
    // Upcoming days follow the new default unless set individually.
    await q("update app.recording_days set capacity = $1 where not capacity_override and day >= app.studio_today()", [cap]);
  }
  if (typeof s.paused === "boolean") await q("update app.settings set paused = $1, updated_at = now()", [s.paused]);
  // Re-opened or raised capacity may free slots for waitlisted customers.
  await q("select app.offer_waitlist()");
}

export async function studioSetDay(d: string, capacity: number, closed: boolean) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new AppError("bad_day");
  const cap = Math.max(0, Math.min(50, Math.round(capacity)));
  await q(
    `insert into app.recording_days (day, capacity, closed, capacity_override) values ($1, $2, $3, true)
     on conflict (day) do update set capacity = excluded.capacity, closed = excluded.closed, capacity_override = true`,
    [d, cap, closed],
  );
  await q("select app.offer_waitlist()");
}

// ---------------------------------------------------------------- maintenance

/** Deletes expired photos (object first, then row), sweeps orphans, expires holds. */
export async function runMaintenance() {
  const out = { photosDeleted: 0, videosExpired: 0, orphansDeleted: 0, holdsExpired: 0 };
  // Delivered videos past their 30-day window: delete the file, then mark expired.
  const vids = await q<{ order_id: string; video_path: string }>("select * from app.expired_video_paths(200)");
  for (const v of vids) {
    await removeObjects(VIDEO_BUCKET, [v.video_path]);
    await q("select app.mark_video_expired($1)", [v.order_id]);
    out.videosExpired++;
  }
  const expired = await q<{ hug_id: string; storage_path: string }>("select * from app.expired_photo_paths(200)");
  for (const p of expired) {
    await removeObjects(PHOTO_BUCKET, [p.storage_path]);
    await q("select app.forget_expired_photo($1)", [p.hug_id]);
    out.photosDeleted++;
  }
  for (const bucket of [PHOTO_BUCKET, VIDEO_BUCKET]) {
    const orphans = await q<{ name: string }>("select * from app.orphaned_objects($1)", [bucket]);
    if (orphans.length) {
      await removeObjects(bucket, orphans.map((o) => o.name));
      out.orphansDeleted += orphans.length;
    }
  }
  const h = await one<{ n: number }>("select app.expire_holds() as n");
  out.holdsExpired = h?.n ?? 0;
  return out;
}
