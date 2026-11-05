"use client";

import { AnimatePresence, motion } from "motion/react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/Button";
import { HugMark } from "@/components/Wordmark";
import {
  CATEGORIES,
  CATEGORY_INFO,
  OCCASIONS,
  OCCASION_INFO,
  TONES,
  TONE_INFO,
  type Category,
  type Intensity,
  type Occasion,
  type Tone,
} from "@/lib/catalog";
import { compose } from "@/lib/composer/index.ts";
import { markSeen, saveHug, seenLines } from "@/lib/client/my-hugs";
import { preparePhoto } from "@/lib/client/photo";
import { CONSENT_TEXT, VIDEO_PHOTO_TEXT } from "@/lib/privacy";

const DEFAULT_TONE: Record<Category, Tone> = {
  encourage: "heartfelt",
  roast: "deadpan",
  flirt: "playful",
  laugh: "playful",
};

const STEPS = ["For", "Kind", "Feel", "Personal", "Wrap"] as const;

function Option({
  selected,
  onClick,
  title,
  sub,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  title: React.ReactNode;
  sub?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`group relative w-full rounded-[1.4rem] border px-5 py-4 text-left transition-all duration-300 ease-hug active:scale-[0.99] ${
        selected
          ? "border-ink bg-card shadow-[0_18px_40px_-24px_rgb(36_28_23/.45)]"
          : "border-line bg-card/50 hover:border-ink/30 hover:bg-card"
      }`}
    >
      <span
        aria-hidden
        className={`absolute top-4 right-4 flex h-6 w-6 items-center justify-center rounded-full border transition-all duration-300 ${
          selected ? "border-clay bg-clay" : "border-ink/20"
        }`}
      >
        <span className={`h-2 w-2 rounded-full bg-card transition-transform duration-300 ${selected ? "scale-100" : "scale-0"}`} />
      </span>
      <span className="block pr-8 font-display text-[1.3rem] leading-tight tracking-[-0.015em]">{title}</span>
      {sub && <span className="mt-1 block pr-6 text-[0.92rem] leading-snug text-ink-soft">{sub}</span>}
      {children}
    </button>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[0.92rem] font-medium">{label}</span>
      {hint && <span className="mt-0.5 block text-[0.82rem] text-ink-faint">{hint}</span>}
      <span className="mt-2 block">{children}</span>
    </label>
  );
}

const inputCls =
  "w-full rounded-2xl border border-line bg-card px-4 py-3.5 text-[1rem] placeholder:text-ink-faint/70 transition focus:border-ink/40 focus:outline-none";

export function CreateFlow() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  const [forSelf, setForSelf] = useState<boolean | null>(null);
  const [category, setCategory] = useState<Category | null>(null);
  const [tone, setTone] = useState<Tone>("heartfelt");
  const [intensity, setIntensity] = useState<Intensity>(2);
  const [recipientName, setRecipientName] = useState("");
  const [senderName, setSenderName] = useState("");
  const [occasion, setOccasion] = useState<Occasion | null>(null);
  const [interestsRaw, setInterestsRaw] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [consent, setConsent] = useState(false);
  const [photoForVideo, setPhotoForVideo] = useState(false);
  const [previewSeed, setPreviewSeed] = useState(7);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const topRef = useRef<HTMLDivElement>(null);

  useEffect(() => () => void (photoUrl && URL.revokeObjectURL(photoUrl)), [photoUrl]);

  const interests = useMemo(
    () => interestsRaw.split(/[,\n]/).map((s) => s.trim()).filter(Boolean).slice(0, 3),
    [interestsRaw],
  );

  const preview = useMemo(() => {
    if (!category) return null;
    const h = compose({ category, tone, intensity, seed: previewSeed });
    return h.paragraphs[1];
  }, [category, tone, intensity, previewSeed]);

  const canContinue = [forSelf !== null, category !== null, true, !photo || consent, true][step];

  function go(to: number) {
    setDir(to > step ? 1 : -1);
    setStep(to);
    setError(null);
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function onPhoto(f: File | undefined) {
    if (!f) return;
    setError(null);
    setPhotoBusy(true);
    try {
      const clean = await preparePhoto(f);
      if (photoUrl) URL.revokeObjectURL(photoUrl);
      setPhoto(clean);
      setPhotoUrl(URL.createObjectURL(clean));
      setConsent(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "That photo didn’t work.");
    } finally {
      setPhotoBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function removePhoto() {
    if (photoUrl) URL.revokeObjectURL(photoUrl);
    setPhoto(null);
    setPhotoUrl(null);
    setConsent(false);
    setPhotoForVideo(false);
  }

  async function submit() {
    if (!category || forSelf === null) return;
    setSubmitting(true);
    setError(null);
    const fd = new FormData();
    fd.set(
      "data",
      JSON.stringify({
        forSelf,
        category,
        tone,
        intensity,
        recipientName,
        senderName,
        occasion: occasion ?? undefined,
        interests,
        avoid: seenLines(),
        photoConsent: Boolean(photo && consent),
        photoForVideo: Boolean(photo && consent && photoForVideo),
      }),
    );
    if (photo && consent) fd.set("photo", photo);
    try {
      const res = await fetch("/api/hugs", { method: "POST", body: fd });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Something went wrong.");
      saveHug({
        token: body.token,
        ownerKey: body.ownerKey,
        headline: recipientName ? `A Word Hug for ${recipientName}` : "A Word Hug, just for you",
        createdAt: new Date().toISOString(),
        forSelf,
        recipientName,
      });
      markSeen(body.lineIds ?? []);
      router.push(`/h/${body.token}?new=1`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setSubmitting(false);
    }
  }

  const info = category ? CATEGORY_INFO[category] : null;
  const them = forSelf ? "you" : recipientName || "them";

  return (
    <div ref={topRef} className="mx-auto w-full max-w-xl scroll-mt-4 px-5 pb-40">
      {/* progress */}
      <div className="sticky top-0 z-20 -mx-5 bg-paper/85 px-5 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 backdrop-blur-md">
        <div className="flex items-center justify-between">
          <Link href="/" className="text-sm text-ink-soft hover:text-ink" aria-label="Back to home">
            ✕ <span className="sr-only">Close</span>
          </Link>
          <p className="text-[0.75rem] font-medium uppercase tracking-[0.2em] text-ink-faint">
            Step {step + 1} of {STEPS.length}
          </p>
          <span className="w-4" />
        </div>
        <div className="mt-3 flex gap-1.5" aria-hidden>
          {STEPS.map((s, k) => (
            <span key={s} className="h-1 flex-1 overflow-hidden rounded-full bg-ink/10">
              <span
                className="block h-full rounded-full bg-clay transition-all duration-500 ease-hug"
                style={{ width: k < step ? "100%" : k === step ? "50%" : "0%" }}
              />
            </span>
          ))}
        </div>
      </div>

      <AnimatePresence mode="wait" custom={dir} initial={false}>
        <motion.section
          key={step}
          custom={dir}
          initial={{ opacity: 0, x: dir * 28 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: dir * -28 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          className="pt-6"
        >
          {step === 0 && (
            <>
              <h1 className="font-display text-[2.4rem] leading-[1] tracking-[-0.03em]">
                Who’s this <span className="font-wonk">hug</span> for?
              </h1>
              <div className="mt-8 space-y-3">
                <Option selected={forSelf === true} onClick={() => setForSelf(true)} title="For me" sub="I could use one, honestly." />
                <Option
                  selected={forSelf === false}
                  onClick={() => setForSelf(false)}
                  title="For someone else"
                  sub="I’ll send them a private gift link."
                />
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <h1 className="font-display text-[2.4rem] leading-[1] tracking-[-0.03em]">
                What kind of <span className="font-wonk">hug?</span>
              </h1>
              <div className="mt-8 space-y-3">
                {CATEGORIES.map((c) => (
                  <Option
                    key={c}
                    selected={category === c}
                    onClick={() => {
                      setCategory(c);
                      if (category !== c) setTone(DEFAULT_TONE[c]);
                    }}
                    title={CATEGORY_INFO[c].label}
                    sub={CATEGORY_INFO[c].blurb}
                  >
                    <AnimatePresence initial={false}>
                      {category === c && (
                        <motion.span
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="block overflow-hidden"
                        >
                          <span className="mt-3 block border-t border-line pt-3 font-wonk text-[1.02rem] leading-snug">
                            “{CATEGORY_INFO[c].sample}”
                          </span>
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </Option>
                ))}
              </div>
            </>
          )}

          {step === 2 && info && category && (
            <>
              <h1 className="font-display text-[2.4rem] leading-[1] tracking-[-0.03em]">
                How should it <span className="font-wonk">feel?</span>
              </h1>
              <p className="mt-6 text-[0.75rem] font-medium uppercase tracking-[0.2em] text-ink-faint">Tone</p>
              <div className="mt-3 grid grid-cols-2 gap-2.5">
                {TONES.map((t) => (
                  <button
                    key={t}
                    type="button"
                    aria-pressed={tone === t}
                    onClick={() => setTone(t)}
                    className={`rounded-2xl border px-4 py-3.5 text-left transition-all duration-300 ease-hug active:scale-[0.98] ${
                      tone === t ? "border-ink bg-card" : "border-line bg-card/50 hover:border-ink/30"
                    }`}
                  >
                    <span className={`block font-display text-[1.15rem] ${t === "poetic" ? "font-wonk" : ""}`}>{TONE_INFO[t].label}</span>
                    <span className="block text-[0.8rem] text-ink-soft">{TONE_INFO[t].hint}</span>
                  </button>
                ))}
              </div>

              <p className="mt-8 text-[0.75rem] font-medium uppercase tracking-[0.2em] text-ink-faint">Intensity</p>
              <div role="radiogroup" aria-label="Intensity" className="mt-3 grid grid-cols-3 rounded-full border border-line bg-card/60 p-1">
                {([1, 2, 3] as const).map((i) => (
                  <button
                    key={i}
                    type="button"
                    role="radio"
                    aria-checked={intensity === i}
                    onClick={() => setIntensity(i)}
                    className="relative rounded-full px-2 py-2.5 text-center text-[0.84rem] leading-tight"
                  >
                    {intensity === i && (
                      <motion.span layoutId="intensity" className="absolute inset-0 rounded-full bg-ink" transition={{ type: "spring", bounce: 0.2, duration: 0.5 }} />
                    )}
                    <span className={`relative ${intensity === i ? "text-card" : "text-ink-soft"}`}>{info.intensity[i - 1]}</span>
                  </button>
                ))}
              </div>

              <div className="grain mt-8 rounded-[1.4rem] bg-card px-5 py-5 shadow-[0_18px_40px_-28px_rgb(36_28_23/.5)]">
                <div className="flex items-center justify-between">
                  <p className="text-[0.7rem] font-medium uppercase tracking-[0.2em] text-clay">A little taste</p>
                  <button type="button" onClick={() => setPreviewSeed((s) => s + 1)} className="relative z-10 text-[0.8rem] text-ink-soft underline underline-offset-4 hover:text-ink">
                    Another
                  </button>
                </div>
                <AnimatePresence mode="wait">
                  <motion.p
                    key={preview}
                    initial={{ opacity: 0, y: 6, filter: "blur(4px)" }}
                    animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                    exit={{ opacity: 0, y: -6, filter: "blur(4px)" }}
                    transition={{ duration: 0.35 }}
                    className="mt-3 font-display text-[1.15rem] leading-snug"
                  >
                    {preview}
                  </motion.p>
                </AnimatePresence>
                <p className="mt-3 text-[0.78rem] text-ink-faint">Your real hug will be different — and personal.</p>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <h1 className="font-display text-[2.4rem] leading-[1] tracking-[-0.03em]">
                Make it <span className="font-wonk">personal.</span>
              </h1>
              <p className="mt-3 text-ink-soft">Everything here is optional. The more you share, the more it sounds like it was written for {them}.</p>

              <div className="mt-8 space-y-6">
                <Field label={forSelf ? "What should we call you?" : "Their name"}>
                  <input className={inputCls} value={recipientName} onChange={(e) => setRecipientName(e.target.value)} maxLength={40} autoComplete={forSelf ? "given-name" : "off"} placeholder={forSelf ? "e.g. Sam" : "e.g. Maya"} />
                </Field>
                {!forSelf && (
                  <Field label="Signed by" hint="How you’d like to sign it. Leave blank to stay mysterious.">
                    <input className={inputCls} value={senderName} onChange={(e) => setSenderName(e.target.value)} maxLength={40} autoComplete="given-name" placeholder="e.g. Jess" />
                  </Field>
                )}

                <div>
                  <p className="text-[0.92rem] font-medium">What’s going on?</p>
                  <div className="mt-2.5 flex flex-wrap gap-2">
                    {OCCASIONS.filter((o) => !(forSelf && o === "missing")).map((o) => (
                      <button
                        key={o}
                        type="button"
                        aria-pressed={occasion === o}
                        onClick={() => setOccasion(occasion === o ? null : o)}
                        className={`rounded-full border px-4 py-2 text-[0.88rem] transition-all duration-200 active:scale-95 ${
                          occasion === o ? "border-ink bg-ink text-card" : "border-line bg-card/60 text-ink-soft hover:border-ink/30"
                        }`}
                      >
                        {OCCASION_INFO[o]}
                      </button>
                    ))}
                  </div>
                </div>

                <Field label={forSelf ? "A few things you love" : "A few things they love"} hint="Separate with commas. Up to three.">
                  <input className={inputCls} value={interestsRaw} onChange={(e) => setInterestsRaw(e.target.value)} maxLength={120} placeholder="sourdough, the Mets, a cat called Biscuit" />
                </Field>

                {/* Photo */}
                <div className="rounded-[1.4rem] border border-dashed border-ink/20 bg-card/40 p-4">
                  <div className="flex items-start gap-4">
                    {photoUrl ? (
                      <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-paper-2">
                        <Image src={photoUrl} alt="Your selected photo" fill unoptimized className="object-cover" />
                      </div>
                    ) : (
                      <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl bg-paper-2 text-ink-faint">
                        <HugMark className="h-7 w-7" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-[0.92rem] font-medium">Add a photo <span className="font-normal text-ink-faint">(optional)</span></p>
                      <p className="mt-0.5 text-[0.8rem] leading-snug text-ink-faint">Shown on the hug like a little keepsake.</p>
                      <div className="mt-3 flex gap-2">
                        <Button type="button" variant="ghost" size="sm" disabled={photoBusy} onClick={() => fileRef.current?.click()}>
                          {photoBusy ? "Preparing…" : photo ? "Change" : "Choose photo"}
                        </Button>
                        {photo && (
                          <Button type="button" variant="quiet" size="sm" onClick={removePhoto}>
                            Remove
                          </Button>
                        )}
                      </div>
                      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => onPhoto(e.target.files?.[0])} />
                    </div>
                  </div>
                  {photo && (
                    <div className="mt-4 space-y-3 border-t border-line pt-4">
                      <p className="text-[0.8rem] leading-relaxed text-ink-soft">
                        We never analyze photos or guess anything about the people in them. Your phone re-saves it first to strip location and camera data.
                      </p>
                      <label className="flex items-start gap-3 text-[0.86rem] leading-snug">
                        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--color-clay)]" />
                        <span>{CONSENT_TEXT}</span>
                      </label>
                      <label className="flex items-start gap-3 text-[0.86rem] leading-snug text-ink-soft">
                        <input type="checkbox" checked={photoForVideo} disabled={!consent} onChange={(e) => setPhotoForVideo(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--color-clay)]" />
                        <span>{VIDEO_PHOTO_TEXT}</span>
                      </label>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          {step === 4 && info && (
            <>
              <h1 className="font-display text-[2.4rem] leading-[1] tracking-[-0.03em]">
                Ready to <span className="font-wonk">wrap it?</span>
              </h1>
              <div className="grain mt-8 rounded-[1.6rem] bg-card p-6 shadow-[0_24px_60px_-32px_rgb(36_28_23/.5)]">
                <dl className="relative z-10 divide-y divide-line text-[0.95rem]">
                  {[
                    ["For", forSelf ? `You${recipientName ? ` (${recipientName})` : ""}` : recipientName || "Someone special"],
                    ...(!forSelf ? [["From", senderName || "A mystery admirer"]] : []),
                    ["Kind", info.label],
                    ["Feel", `${TONE_INFO[tone].label} · ${info.intensity[intensity - 1]}`],
                    ...(occasion ? [["Occasion", OCCASION_INFO[occasion]]] : []),
                    ...(interests.length ? [["Loves", interests.join(", ")]] : []),
                    ...(photo && consent ? [["Photo", "Attached privately"]] : []),
                  ].map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-6 py-2.5">
                      <dt className="text-ink-faint">{k}</dt>
                      <dd className="text-right">{v}</dd>
                    </div>
                  ))}
                </dl>
                <div className="relative z-10 mt-5 flex items-baseline justify-between rounded-2xl bg-paper px-4 py-3">
                  <span className="font-display text-lg">Written Word Hug</span>
                  <span className="text-right">
                    <span className="mr-2 whitespace-nowrap text-ink-faint line-through">$1</span>
                    <span className="whitespace-nowrap font-medium text-clay">Free in preview</span>
                  </span>
                </div>
                <p className="relative z-10 mt-3 text-[0.78rem] text-ink-faint">No card needed. Nothing is charged during the prototype.</p>
              </div>
            </>
          )}

          {error && (
            <p role="alert" className="mt-6 rounded-2xl bg-blush/60 px-4 py-3 text-[0.92rem] text-clay-deep">
              {error}
            </p>
          )}
        </motion.section>
      </AnimatePresence>

      {/* bottom bar */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-paper/90 backdrop-blur-md safe-bottom">
        <div className="mx-auto flex max-w-xl items-center gap-3 px-5 pt-3">
          {step > 0 ? (
            <Button variant="quiet" size="md" onClick={() => go(step - 1)} className="px-3">
              ← Back
            </Button>
          ) : (
            <span />
          )}
          <div className="flex-1" />
          {step < 4 ? (
            <Button size="md" onClick={() => go(step + 1)} disabled={!canContinue} className="min-w-[10rem]">
              {step === 3 && !recipientName && !occasion && !interests.length && !photo ? "Skip" : "Continue"}
            </Button>
          ) : (
            <Button size="md" onClick={submit} disabled={submitting} className="min-w-[12rem]">
              {submitting ? "Wrapping…" : "Wrap my Word Hug"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
