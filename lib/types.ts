import type { Category, Intensity, Occasion, Tone } from "./catalog";

export type HugContent = {
  headline: string;
  kicker: string;
  paragraphs: string[];
  lineIds: string[];
};

export type PhotoRecord = {
  file: string; // private storage key, never a public path
  mime: string;
  bytes: number;
  consentAt: string;
  consentText: string;
  /** Owner allowed the founder to see the photo when recording a video. */
  allowForVideo: boolean;
  expiresAt: string;
};

export type DemoPayment = {
  provider: "demo"; // "stripe" later
  amountCents: number;
  status: "demo_free" | "demo_authorized" | "demo_refunded";
};

export type Hug = {
  id: string;
  token: string; // private gift-link capability
  ownerKeyHash: string;
  createdAt: string;
  forSelf: boolean;
  recipientName: string;
  senderName: string;
  category: Category;
  tone: Tone;
  intensity: Intensity;
  occasion?: Occasion;
  interests: string[];
  seed: number;
  content: HugContent;
  revisions: number;
  photo?: PhotoRecord;
  payment: DemoPayment;
  demo?: boolean;
};

export const VIDEO_STATUSES = ["queued", "recording", "ready", "canceled"] as const;
export type VideoStatus = (typeof VIDEO_STATUSES)[number];

export type VideoOrder = {
  id: string;
  hugId: string;
  createdAt: string;
  status: VideoStatus;
  history: { status: VideoStatus; at: string }[];
  note: string;
  video?: { file: string; mime: string; bytes: number; uploadedAt: string };
  payment: DemoPayment;
  canceledReason?: string;
  demo?: boolean;
};

export type StudioSettings = {
  dailyCapacity: number;
  paused: boolean;
};

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
  video: { status: VideoStatus } | null;
};

export type OwnerVideoView = {
  id: string;
  status: VideoStatus;
  createdAt: string;
  queuePosition: number | null;
  note: string;
  canceledReason?: string;
};

export type StudioOrder = {
  id: string;
  createdAt: string;
  status: "queued" | "recording" | "ready" | "canceled";
  history: { status: string; at: string }[];
  note: string;
  demo: boolean;
  amountCents: number;
  paymentStatus: string;
  canceledReason?: string;
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
  } | null;
};
