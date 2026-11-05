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

export async function createHug(input: CreateHugInput) {
  const recipientName = cleanName(input.recipientName);
  const senderName = input.forSelf ? "" : cleanName(input.senderName);
  const interests = cleanInterests(input.interests);
  const seed = Math.floor(Math.random() * 2 ** 31);
  const content = compose({
    category: input.category,
    tone: input.tone,
    intensity: input.intensity,
    name: recipientName,
    interests,
    occasion: input.occasion,
    avoid: input.avoid,
    seed,
  });
  const token = newToken();
  const ownerKey = newOwnerKey();

  // Photo: consent is mandatory; type is checked by magic bytes, not by name.
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
    await tx(async (c) => {
      const { rows } = await c.query<{ id: string }>(
        `insert into app.hugs (token, owner_key_hash, for_self, recipient_name, sender_name, category, tone, intensity,
                               occasion, interests, seed, headline, kicker, paragraphs, line_ids)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) returning id`,
        [token, hashKey(ownerKey), input.forSelf, recipientName, senderName, input.category, input.tone, input.intensity,
         input.occasion ?? null, interests, seed, content.headline, content.kicker, content.paragraphs, content.lineIds],
      );
      await c.query(
        `insert into app.payments (sku, hug_id, provider, amount_cents, status)
         select 'hug_written', $1, 'demo', amount_cents, 'demo_free' from app.products where sku = 'hug_written'`,
        [rows[0].id],
      );
      if (photoPath && photoMime && input.photo) {
        await c.query(
          `insert into app.hug_photos (hug_id, storage_path, mime, bytes, consent_at, consent_text, consent_version, allow_for_video, expires_at)
           values ($1, $2, $3, $4, now(), $5, $6, $7, now() + make_interval(days => $8))`,
          [rows[0].id, photoPath, photoMime, input.photo.bytes.byteLength, CONSENT_TEXT, CONSENT_VERSION, input.photo.allowForVideo, PHOTO_DAYS],
        );
      }
    });
  } catch (e) {
    await removeObjects(PHOTO_BUCKET, [photoPath]).catch(() => undefined);
    throw e;
  }
  return { token, ownerKey, lineIds: content.lineIds };
}

async function hugByToken(token: string) {
  if (!TOKEN_RE.test(token)) return null;
  return one<HugRow>("select * from app.hugs where token = $1", [token]);
}

/** Gift-link view. The token is the capability. */
export async function getPublicHug(token: string): Promise<PublicHug | null> {
  const h = await hugByToken(token);
  if (!h) return null;
  const extra = await one<{ has_photo: boolean; video_ready: boolean }>(
    `select exists (select 1 from app.hug_photos where hug_id = $1) as has_photo,
            exists (select 1 from app.video_orders where hug_id = $1 and status = 'ready') as video_ready`,
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
    videoReady: Boolean(extra?.video_ready),
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
    canceled_reason: string | null; pos: number | null;
  }>(
    `select o.id, o.status, o.recording_day, o.hold_expires_at, o.note, o.canceled_reason,
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

export async function videoLink(token: string) {
  const h = await hugByToken(token);
  if (!h) return null;
  const v = await one<{ video_path: string }>(
    "select video_path from app.video_orders where hug_id = $1 and status = 'ready' and video_path is not null",
    [h.id],
  );
  return v ? signedViewUrl(VIDEO_BUCKET, v.video_path, VIDEO_LINK_SECONDS) : null;
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

export async function bookVideo(hugId: string, note: string) {
  await wrap(q("select * from app.book_video($1, $2)", [hugId, note.slice(0, 400)]));
}

export async function cancelVideoByCustomer(hugId: string) {
  const v = await one<{ id: string }>("select id from app.video_orders where hug_id = $1 and status <> 'canceled'", [hugId]);
  if (!v) throw new AppError("not_found");
  await wrap(q("select app.cancel_video($1, 'customer', 'Cancelled by you')", [v.id]));
}

export const joinWaitlist = (hugId: string, note: string) => wrap(q("select app.join_waitlist($1, $2)", [hugId, note.slice(0, 400)]));
export const leaveWaitlist = (hugId: string) => wrap(q("select app.leave_waitlist($1)", [hugId]));
export const confirmHold = (hugId: string) => wrap(q("select * from app.confirm_hold($1)", [hugId]));

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

export async function createStudioSession() {
  const raw = newToken() + newToken();
  await q("insert into app.studio_sessions (token_hash, expires_at) values ($1, now() + interval '12 hours')", [hashKey(raw)]);
  return raw;
}

export async function checkStudioSession(raw: string | undefined) {
  if (!raw || !/^[A-Za-z0-9_-]{32,128}$/.test(raw)) return false;
  const r = await one("select 1 from app.studio_sessions where token_hash = $1 and revoked_at is null and expires_at > now()", [hashKey(raw)]);
  return Boolean(r);
}

export async function revokeStudioSession(raw: string | undefined) {
  if (raw) await q("update app.studio_sessions set revoked_at = now() where token_hash = $1", [hashKey(raw)]);
}

export async function studioOverview(): Promise<{ orders: StudioOrder[]; days: StudioDay[]; settings: { defaultCapacity: number; paused: boolean; today: string }; waitlist: number }> {
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
    one<{ default_daily_capacity: number; paused: boolean; today: Date }>("select default_daily_capacity, paused, app.studio_today() as today from app.settings"),
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

export async function studioFinalize(orderId: string, path: string) {
  assertUuid(orderId);
  if (!/^[A-Za-z0-9_-]+\.(mp4|mov|webm)$/.test(path)) throw new AppError("upload_missing");
  await wrap(q("select app.mark_video_ready($1, $2)", [orderId, path]));
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

export async function studioSettings(s: { defaultCapacity?: number; paused?: boolean }) {
  if (typeof s.defaultCapacity === "number") {
    await q("update app.settings set default_daily_capacity = $1, updated_at = now()", [Math.max(0, Math.min(50, Math.round(s.defaultCapacity)))]);
  }
  if (typeof s.paused === "boolean") await q("update app.settings set paused = $1, updated_at = now()", [s.paused]);
  // Re-opened or raised capacity may free slots for waitlisted customers.
  await q("select app.offer_waitlist()");
}

export async function studioSetDay(d: string, capacity: number, closed: boolean) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new AppError("bad_day");
  const cap = Math.max(0, Math.min(50, Math.round(capacity)));
  await q(
    `insert into app.recording_days (day, capacity, closed) values ($1, $2, $3)
     on conflict (day) do update set capacity = excluded.capacity, closed = excluded.closed`,
    [d, cap, closed],
  );
  await q("select app.offer_waitlist()");
}

// ---------------------------------------------------------------- maintenance

/** Deletes expired photos (object first, then row), sweeps orphans, expires holds. */
export async function runMaintenance() {
  const out = { photosDeleted: 0, orphansDeleted: 0, holdsExpired: 0 };
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
