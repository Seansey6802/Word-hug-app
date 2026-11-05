import type { Hug, OwnerVideoView, PublicHug, VideoOrder } from "../types";
import type { DB } from "./store";

const TZ = process.env.STUDIO_TZ ?? "America/New_York";

export function dayKey(iso: string | number) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date(iso),
  );
}

export function capacity(db: DB) {
  const today = dayKey(Date.now());
  const usedToday = db.videos.filter((v) => v.status !== "canceled" && dayKey(v.createdAt) === today).length;
  const cap = db.settings.dailyCapacity;
  const open = db.videos.filter((v) => v.status === "queued" || v.status === "recording").length;
  const remaining = db.settings.paused ? 0 : Math.max(0, cap - usedToday);
  return { capacity: cap, usedToday, remaining, open, paused: db.settings.paused };
}

export function activeVideoFor(db: DB, hugId: string): VideoOrder | undefined {
  return db.videos
    .filter((v) => v.hugId === hugId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .find((v) => v.status !== "canceled") ??
    db.videos.filter((v) => v.hugId === hugId).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
}

/** A video is only "ready" if a file has actually been uploaded. */
export function effectiveStatus(v: VideoOrder) {
  if (v.status === "ready" && !v.video) return "recording" as const;
  return v.status;
}

export function toPublic(db: DB, h: Hug): PublicHug {
  const v = activeVideoFor(db, h.id);
  return {
    token: h.token,
    createdAt: h.createdAt,
    forSelf: h.forSelf,
    recipientName: h.recipientName,
    senderName: h.senderName,
    category: h.category,
    content: { headline: h.content.headline, kicker: h.content.kicker, paragraphs: h.content.paragraphs },
    hasPhoto: Boolean(h.photo),
    video: v && effectiveStatus(v) !== "canceled" ? { status: effectiveStatus(v) } : null,
  };
}

export function ownerVideoView(db: DB, h: Hug): OwnerVideoView | null {
  const v = activeVideoFor(db, h.id);
  if (!v) return null;
  const queue = db.videos
    .filter((x) => x.status === "queued")
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const pos = queue.findIndex((x) => x.id === v.id);
  return {
    id: v.id,
    status: effectiveStatus(v),
    createdAt: v.createdAt,
    queuePosition: pos >= 0 ? pos + 1 : null,
    note: v.note,
    canceledReason: v.canceledReason,
  };
}
