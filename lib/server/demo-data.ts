// Fictional demonstration data so the studio queue isn't empty on first run.
// Every record is flagged demo: true and every name is invented.

import { compose } from "../composer/index.ts";
import type { Category, Intensity, Occasion, Tone } from "../catalog";
import type { DB } from "./store";
import type { Hug, VideoOrder, VideoStatus } from "../types";
import { hashKey, newId, newToken } from "./ids";

const DEMO: {
  recipient: string;
  sender: string;
  category: Category;
  tone: Tone;
  intensity: Intensity;
  occasion?: Occasion;
  interests: string[];
  note: string;
  status: VideoStatus;
  hoursAgo: number;
}[] = [
  {
    recipient: "Priya",
    sender: "Dev",
    category: "encourage",
    tone: "heartfelt",
    intensity: 3,
    occasion: "big_day",
    interests: ["bouldering"],
    note: "She defends her thesis on Thursday. Pronounced PREE-ya. Please make her cry (good tears).",
    status: "recording",
    hoursAgo: 5,
  },
  {
    recipient: "Marcus",
    sender: "The Tuesday Trivia Team",
    category: "roast",
    tone: "deadpan",
    intensity: 2,
    occasion: "birthday",
    interests: ["fantasy football"],
    note: "He's turning 40. Mention he still hasn't returned our cooler.",
    status: "queued",
    hoursAgo: 3,
  },
  {
    recipient: "June",
    sender: "",
    category: "laugh",
    tone: "playful",
    intensity: 2,
    occasion: "tough_week",
    interests: ["crosswords", "her cat Biscuit"],
    note: "For me! Rough week. Ducks encouraged.",
    status: "queued",
    hoursAgo: 1,
  },
];

export function seedDemoData(db: DB) {
  const now = Date.now();
  DEMO.forEach((d, k) => {
    const createdAt = new Date(now - d.hoursAgo * 3600_000).toISOString();
    const seed = 1000 + k * 37;
    const hug: Hug = {
      id: newId(),
      token: newToken(),
      ownerKeyHash: hashKey(newId()), // nobody holds this key: demo only
      createdAt,
      forSelf: !d.sender,
      recipientName: d.recipient,
      senderName: d.sender,
      category: d.category,
      tone: d.tone,
      intensity: d.intensity,
      occasion: d.occasion,
      interests: d.interests,
      seed,
      content: compose({ ...d, name: d.recipient, seed }),
      revisions: 0,
      payment: { provider: "demo", amountCents: 100, status: "demo_free" },
      demo: true,
    };
    const history: VideoOrder["history"] = [{ status: "queued", at: createdAt }];
    if (d.status === "recording") history.push({ status: "recording", at: new Date(now - 1800_000).toISOString() });
    const order: VideoOrder = {
      id: newId(),
      hugId: hug.id,
      createdAt,
      status: d.status,
      history,
      note: d.note,
      payment: { provider: "demo", amountCents: 500, status: "demo_authorized" },
      demo: true,
    };
    db.hugs.push(hug);
    db.videos.push(order);
  });
}
