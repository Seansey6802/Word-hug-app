import { isStudio } from "@/lib/server/studio";
import { read } from "@/lib/server/store";
import { capacity, effectiveStatus } from "@/lib/server/hugs";
import { json } from "@/lib/server/http";
import type { StudioOrder } from "@/lib/types";
import { CATEGORY_INFO, OCCASION_INFO, TONE_INFO } from "@/lib/catalog";

export const runtime = "nodejs";

export async function GET() {
  if (!(await isStudio())) return json({ error: "Studio sign-in required." }, 401);
  return json(
    await read((db) => {
      const orders: StudioOrder[] = db.videos
        .slice()
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .map((v) => {
          const h = db.hugs.find((x) => x.id === v.hugId);
          return {
            id: v.id,
            createdAt: v.createdAt,
            status: effectiveStatus(v),
            history: v.history,
            note: v.note,
            demo: Boolean(v.demo),
            amountCents: v.payment.amountCents,
            paymentStatus: v.payment.status,
            canceledReason: v.canceledReason,
            hasVideo: Boolean(v.video),
            hug: h
              ? {
                  token: h.token,
                  recipientName: h.recipientName,
                  senderName: h.senderName,
                  forSelf: h.forSelf,
                  kind: CATEGORY_INFO[h.category].label,
                  tone: `${TONE_INFO[h.tone].label} · ${CATEGORY_INFO[h.category].intensity[h.intensity - 1]}`,
                  occasion: h.occasion ? OCCASION_INFO[h.occasion] : undefined,
                  interests: h.interests,
                  headline: h.content.headline,
                  paragraphs: h.content.paragraphs,
                  photoForVideo: Boolean(h.photo?.allowForVideo),
                }
              : null,
          };
        });
      return { orders, capacity: capacity(db), settings: db.settings };
    }),
  );
}
