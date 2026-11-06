import type { Metadata } from "next";
import { SiteFooter, SiteHeader } from "@/components/SiteHeader";
import { PHOTO_DAYS } from "@/lib/privacy";

export const metadata: Metadata = { title: "Privacy" };

const ITEMS: [string, string][] = [
  ["Gift links are private", "Each hug lives at a long, random link. It isn’t listed, indexed or searchable. Anyone you share the link with can open it, so share it with care."],
  ["Owner controls stay on your device", "When you make a hug, a private key is saved on your device. That key — not the gift link — lets you rewrite, order a video, or delete. Recipients can’t delete your hug."],
  ["Photos: consent first, analysis never", "A photo is only stored if you tick the consent box. We never analyze photos, run face recognition, or infer anything about anyone in them — not age, ethnicity, gender, health, or anything else. Your device re-saves the photo before upload, which strips location and camera data."],
  [`Photos delete themselves after ${PHOTO_DAYS} days`, "Or immediately, whenever you press “Delete photo”. Deleting a hug deletes its photo and video too."],
  ["Videos are kept for 30 days", "A delivered video can be watched and downloaded for 30 days. After that the file is permanently deleted. Download it if you want to keep it."],
  ["The founder sees only what you allow", "If you order a video, the founder sees the hug’s words and your note. They see your photo only if you separately allowed it."],
  ["No ads. No selling data. Ever.", "Word Hug makes money from hugs, not from you."],
  ["Payments", "Card details are handled by Stripe; Word Hug never sees or stores your card number. During the private beta, payments run in Stripe test mode."],
];

export default function PrivacyPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-2xl px-5 pt-6 sm:px-8">
        <h1 className="font-display text-[2.6rem] leading-[1] tracking-[-0.03em]">
          Privacy, <span className="font-wonk">plainly.</span>
        </h1>
        <dl className="mt-10 space-y-8">
          {ITEMS.map(([t, d]) => (
            <div key={t} className="border-t border-line pt-4">
              <dt className="font-display text-[1.25rem]">{t}</dt>
              <dd className="mt-1.5 leading-relaxed text-ink-soft">{d}</dd>
            </div>
          ))}
        </dl>
      </main>
      <SiteFooter />
    </>
  );
}
