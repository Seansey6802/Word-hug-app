import type { Category } from "./catalog";

export type HugContent = {
  headline: string;
  kicker: string;
  paragraphs: string[];
  lineIds: string[];
};

export const VIDEO_STATUSES = ["held", "booked", "recording", "ready", "expired", "canceled"] as const;
export type VideoStatus = (typeof VIDEO_STATUSES)[number];

/** What a gift-link viewer is allowed to see. No owner secrets, no internals. */
export type PublicHug = {
  token: string;
  createdAt: string;
  forSelf: boolean;
  recipientName: string;
  senderName: string;
  category: Category;
  content: Omit<HugContent, "lineIds">;
  hasPhoto: boolean;
  /** Recipients only learn that a video is ready — never queue internals. */
  videoReady: boolean;
  /** When the delivered video stops being available (30-day retention). */
  videoExpiresAt: string | null;
};

export type OwnerVideoView = {
  id: string;
  status: VideoStatus;
  recordingDay: string; // YYYY-MM-DD in the studio's timezone
  holdExpiresAt: string | null;
  positionInDay: number | null;
  videoExpiresAt: string | null;
  holdKind: "checkout" | "waitlist" | null;
  /** method_saved | authorized | captured | action_required | capture_failed | refunded | disputed | canceled */
  payment: string | null;
  note: string;
  canceledReason: string | null;
};

export type OwnerState = {
  video: OwnerVideoView | null;
  waitlist: { status: "waiting" | "offered"; joinedAt: string } | null;
  nextAvailable: { day: string; remaining: number } | null;
  paused: boolean;
  today: string;
  photo: { allowForVideo: boolean; expiresAt: string } | null;
  revisions: number;
  hasRecoveryEmail: boolean;
};

export type StudioOrder = {
  id: string;
  createdAt: string;
  recordingDay: string;
  status: VideoStatus;
  holdExpiresAt: string | null;
  history: { status: string; at: string; actor: string }[];
  note: string;
  demo: boolean;
  amountCents: number;
  paymentStatus: string;
  canceledReason: string | null;
  hasVideo: boolean;
  hug: {
    token: string;
    recipientName: string;
    senderName: string;
    forSelf: boolean;
    kind: string;
    tone: string;
    occasion?: string;
    interests: string[];
    headline: string;
    paragraphs: string[];
    photoForVideo: boolean;
  };
};

export type StudioDay = { day: string; capacity: number; used: number; closed: boolean };
