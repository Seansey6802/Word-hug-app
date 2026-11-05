"use client";

import { useState } from "react";
import { Button } from "@/components/Button";
import { HugMark } from "@/components/Wordmark";
import type { OwnerVideoView } from "@/lib/types";

type Cap = { remaining: number; capacity: number; paused: boolean };

const STEPS = [
  { key: "queued", label: "Requested" },
  { key: "recording", label: "Being recorded" },
  { key: "ready", label: "Ready to watch" },
] as const;

function Timeline({ status }: { status: OwnerVideoView["status"] }) {
  const at = STEPS.findIndex((s) => s.key === status);
  return (
    <ol className="mt-5 grid grid-cols-3 gap-2">
      {STEPS.map((s, k) => (
        <li key={s.key} className="text-center">
          <span
            className={`mx-auto flex h-8 w-8 items-center justify-center rounded-full border text-sm transition-colors ${
              k < at ? "border-clay bg-clay text-card" : k === at ? "border-clay text-clay" : "border-ink/15 text-ink-faint"
            }`}
          >
            {k < at ? "✓" : k === at ? <span className="h-2 w-2 animate-pulse rounded-full bg-clay" /> : k + 1}
          </span>
          <span className={`mt-2 block text-[0.75rem] leading-tight ${k <= at ? "text-ink" : "text-ink-faint"}`}>{s.label}</span>
        </li>
      ))}
    </ol>
  );
}

export function VideoPanel({
  token,
  ownerKey,
  video,
  capacity,
  recipient,
  onChange,
}: {
  token: string;
  ownerKey: string;
  video: OwnerVideoView | null;
  capacity: Cap | null;
  recipient: string;
  onChange: () => void;
}) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  async function order() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/hugs/${token}/video`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-owner-key": ownerKey },
      body: JSON.stringify({ note }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(body.error ?? "Couldn’t place that order.");
    onChange();
  }

  async function cancel() {
    if (!confirm("Cancel this video? You won’t be charged.")) return;
    setBusy(true);
    const res = await fetch(`/api/hugs/${token}/video`, { method: "DELETE", headers: { "x-owner-key": ownerKey } });
    setBusy(false);
    if (!res.ok) setError((await res.json().catch(() => ({}))).error ?? "Couldn’t cancel.");
    onChange();
  }

  if (video && video.status !== "canceled") {
    return (
      <section className="rounded-[1.6rem] border border-line bg-card/70 p-6">
        <p className="text-[0.7rem] font-medium uppercase tracking-[0.22em] text-clay">Video Word Hug · $5</p>
        <h2 className="mt-2 font-display text-[1.6rem] leading-tight tracking-[-0.02em]">
          {video.status === "queued" && <>You’re in the queue{video.queuePosition ? <> — <span className="font-wonk">#{video.queuePosition}</span></> : null}</>}
          {video.status === "recording" && <>Being recorded <span className="font-wonk">right now.</span></>}
          {video.status === "ready" && <>It’s recorded. <span className="font-wonk">It’s ready.</span></>}
        </h2>
        <Timeline status={video.status} />
        <p className="mt-5 text-[0.88rem] leading-relaxed text-ink-soft">
          {video.status === "ready"
            ? "The video is now on the hug itself — anyone with the private link can watch it."
            : "Our founder records each video by hand. We’ll only show it as ready once the recording is actually uploaded — never before. Check back here anytime."}
        </p>
        {video.note && <p className="mt-3 rounded-xl bg-paper px-3 py-2 text-[0.82rem] text-ink-soft">Your note: “{video.note}”</p>}
        {video.status === "queued" && (
          <Button variant="quiet" size="sm" className="mt-3 -ml-3" onClick={cancel} disabled={busy}>
            Cancel video (no charge)
          </Button>
        )}
        {error && <p className="mt-3 text-[0.85rem] text-clay-deep">{error}</p>}
      </section>
    );
  }

  const full = capacity ? capacity.remaining <= 0 : false;

  return (
    <section className="overflow-hidden rounded-[1.6rem] bg-ink text-card">
      <div className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[0.7rem] font-medium uppercase tracking-[0.22em] text-blush">Upgrade · $5</p>
            <h2 className="mt-2 font-display text-[1.6rem] leading-[1.1] tracking-[-0.02em]">
              Hear it <span className="font-wonk text-blush">out loud.</span>
            </h2>
          </div>
          <HugMark className="h-8 w-8 shrink-0 text-blush" />
        </div>
        <p className="mt-3 text-[0.92rem] leading-relaxed text-card/75">
          A real human — our founder — reads this hug to {recipient} on camera. Recorded by hand, a few each day.
        </p>
        {video?.status === "canceled" && (
          <p className="mt-3 rounded-xl bg-card/10 px-3 py-2 text-[0.82rem] text-card/80">
            Your last video request was cancelled ({video.canceledReason ?? "no reason given"}). You weren’t charged.
          </p>
        )}

        {open && !full && (
          <label className="mt-5 block">
            <span className="text-[0.85rem] text-card/80">Anything the founder should know? <span className="text-card/50">(optional)</span></span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={400}
              rows={3}
              placeholder="How to pronounce their name, an inside joke, the vibe…"
              className="mt-2 w-full rounded-2xl border border-card/15 bg-card/5 px-4 py-3 text-[0.95rem] text-card placeholder:text-card/40 focus:border-card/40 focus:outline-none"
            />
          </label>
        )}

        <div className="mt-5 flex flex-col gap-3">
          {full ? (
            <p className="rounded-2xl border border-card/15 px-4 py-3 text-[0.9rem] text-card/80">
              {capacity?.paused
                ? "The studio is taking a short break. Video orders reopen soon."
                : "Today’s recording slots are full. Fresh slots open tomorrow morning — your written hug is yours either way."}
            </p>
          ) : open ? (
            <Button variant="primary" onClick={order} disabled={busy} className="w-full">
              {busy ? "Placing order…" : "Request video · $5 (demo — no charge)"}
            </Button>
          ) : (
            <Button variant="primary" onClick={() => setOpen(true)} className="w-full">
              Add a video for $5
            </Button>
          )}
          {capacity && !full && (
            <p className="text-center text-[0.78rem] text-card/60">
              {capacity.remaining} of {capacity.capacity} recording slots left today · not charged if we can’t record it
            </p>
          )}
          {error && <p className="text-[0.85rem] text-blush">{error}</p>}
        </div>
      </div>
    </section>
  );
}
