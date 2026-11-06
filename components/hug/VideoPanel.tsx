"use client";

import { useState } from "react";
import { Button } from "@/components/Button";
import { HugMark } from "@/components/Wordmark";
import type { OwnerState, OwnerVideoView } from "@/lib/types";
import { VIDEO_PRICE_CENTS, formatPrice } from "@/lib/commerce/products";
import { formatDay } from "@/lib/dates";

const PRICE = formatPrice(VIDEO_PRICE_CENTS);

const expiry = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric" }) : "30 days after delivery";

const STEPS = [
  { key: "booked", label: "Booked" },
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

function NoteField({ note, setNote, dark = true }: { note: string; setNote: (s: string) => void; dark?: boolean }) {
  return (
    <label className="mt-5 block">
      <span className={`text-[0.85rem] ${dark ? "text-card/80" : "text-ink-soft"}`}>
        Anything the founder should know? <span className="opacity-60">(optional)</span>
      </span>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={400}
        rows={3}
        placeholder="How to pronounce their name, an inside joke, the vibe…"
        className="mt-2 w-full rounded-2xl border border-card/15 bg-card/5 px-4 py-3 text-[0.95rem] text-card placeholder:text-card/40 focus:border-card/40 focus:outline-none"
      />
    </label>
  );
}

export function VideoPanel({
  token,
  ownerKey,
  state,
  recipient,
  onState,
}: {
  token: string;
  ownerKey: string;
  state: OwnerState | null;
  recipient: string;
  onState: (s: OwnerState) => void;
}) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  async function call(path: string, method: string, body?: unknown) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/hugs/${token}/${path}`, {
      method,
      headers: { "content-type": "application/json", "x-owner-key": ownerKey },
      body: body ? JSON.stringify(body) : undefined,
    });
    const out = await res.json().catch(() => ({}));
    if (res.ok && out.checkoutUrl) {
      window.location.href = out.checkoutUrl; // Stripe Checkout (test mode) or the local test checkout
      return;
    }
    setBusy(false);
    if (!res.ok) {
      setError(out.error ?? "That didn’t work.");
      // Refresh so the panel reflects what actually happened (e.g. a day just filled up).
      const fresh = await fetch(`/api/hugs/${token}`, { headers: { "x-owner-key": ownerKey } });
      if (fresh.ok) onState(await fresh.json());
      return;
    }
    onState(out as OwnerState);
  }

  if (!state) return null;
  const v = state.video;
  const when = (d: string) => formatDay(d, state.today);

  // ---- an active order ----
  if (v && v.status !== "canceled") {
    if (v.status === "held" && v.holdKind === "checkout") {
      return (
        <section className="rounded-[1.6rem] border border-line bg-card/70 p-6">
          <p className="text-[0.7rem] font-medium uppercase tracking-[0.22em] text-clay">Founder video · {PRICE}</p>
          <h2 className="mt-2 font-display text-[1.6rem] leading-tight tracking-[-0.02em]">
            Finishing your booking for <span className="font-wonk">{when(v.recordingDay)}.</span>
          </h2>
          <p className="mt-3 text-[0.9rem] leading-relaxed text-ink-soft">
            We’re holding the slot while you save a card. Nothing is charged until your video is recorded and uploaded.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={() => call("video", "POST", { note: v.note })} disabled={busy}>{busy ? "Opening…" : "Continue to checkout"}</Button>
            <Button variant="quiet" onClick={() => call("video", "DELETE")} disabled={busy}>Release the slot</Button>
          </div>
          {error && <p className="mt-3 text-[0.85rem] text-clay-deep">{error}</p>}
        </section>
      );
    }
    if (v.status === "held") {
      return (
        <section className="rounded-[1.6rem] bg-ink p-6 text-card">
          <p className="text-[0.7rem] font-medium uppercase tracking-[0.22em] text-blush">From the waitlist</p>
          <h2 className="mt-2 font-display text-[1.6rem] leading-[1.1] tracking-[-0.02em]">
            A slot opened up — <span className="font-wonk text-blush">{when(v.recordingDay)}.</span>
          </h2>
          <p className="mt-3 text-[0.92rem] leading-relaxed text-card/75">
            We’re holding it for you
            {v.holdExpiresAt && <> until {new Date(v.holdExpiresAt).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" })}</>}.
            Save a card to book your {PRICE} founder video. Nothing was charged while you waited, and you’re charged only after it’s recorded.
          </p>
          <div className="mt-5 flex flex-col gap-2">
            <Button onClick={() => call("video", "POST", { note: v.note })} disabled={busy} className="w-full">
              {busy ? "Opening checkout…" : `Book it · ${PRICE}`}
            </Button>
            <button
              type="button"
              onClick={() => call("waitlist", "DELETE")}
              disabled={busy}
              className="h-11 rounded-full text-[0.92rem] text-card/80 underline-offset-4 hover:text-card hover:underline disabled:opacity-40"
            >
              No thanks, release the slot
            </button>
          </div>
          <p className="mt-2 text-center text-[0.75rem] text-card/50">Beta test mode: test cards only.</p>
          {error && <p className="mt-3 text-[0.85rem] text-blush">{error}</p>}
        </section>
      );
    }
    return (
      <section className="rounded-[1.6rem] border border-line bg-card/70 p-6">
        <p className="text-[0.7rem] font-medium uppercase tracking-[0.22em] text-clay">Founder video · {PRICE}</p>
        <h2 className="mt-2 font-display text-[1.6rem] leading-tight tracking-[-0.02em]">
          {v.status === "booked" && (
            <>
              Booked for <span className="font-wonk">{when(v.recordingDay)}.</span>
            </>
          )}
          {v.status === "recording" && (
            <>
              Being recorded <span className="font-wonk">right now.</span>
            </>
          )}
          {v.status === "ready" && (v.payment === "captured" || v.payment === "refunded") && (
            <>
              It’s recorded. <span className="font-wonk">It’s ready.</span>
            </>
          )}
          {v.status === "ready" && v.payment !== "captured" && v.payment !== "refunded" && (
            <>
              It’s recorded. <span className="font-wonk">Payment pending.</span>
            </>
          )}
          {v.status === "expired" && (
            <>
              Delivered, <span className="font-wonk">and now retired.</span>
            </>
          )}
        </h2>
        {v.status === "booked" && v.positionInDay && (
          <p className="mt-1 text-[0.85rem] text-ink-faint">You’re #{v.positionInDay} on that day’s list.</p>
        )}
        <Timeline status={v.status} />
        <p className="mt-5 text-[0.88rem] leading-relaxed text-ink-soft">
          {v.status === "ready"
            ? `The video is on the hug itself. Anyone with the private link can watch it until ${expiry(v.videoExpiresAt)}. Download it to keep it forever.`
            : v.status === "expired"
              ? "Delivered videos are kept for 30 days, then deleted for privacy. This one has been removed."
              : "Our founder records each video by hand. We’ll only show it as ready once the recording is actually uploaded — never before."}
        </p>
        {(v.payment === "action_required" || v.payment === "capture_failed") && (
          <div role="alert" className="mt-4 rounded-2xl bg-blush/60 px-4 py-3 text-[0.88rem] text-clay-deep">
            {v.status === "ready"
              ? "Your video is recorded! Your bank declined the $15 payment, so we can’t release it yet."
              : "Your bank needs you to approve the $15 before our founder records."}
            <Button size="sm" className="mt-3 w-full" onClick={() => call("video", "POST", { fixPayment: true })} disabled={busy}>
              {busy ? "Opening…" : v.status === "ready" ? `Pay ${PRICE} to release your video` : "Update payment"}
            </Button>
          </div>
        )}
        {v.status !== "ready" && v.payment === "method_saved" && (
          <p className="mt-3 text-[0.82rem] text-ink-faint">Card saved. You’ll be charged {PRICE} only after your video is uploaded.</p>
        )}
        {v.status !== "ready" && v.payment === "authorized" && (
          <p className="mt-3 text-[0.82rem] text-ink-faint">{PRICE} is on hold for recording. It’s captured only once the video is uploaded.</p>
        )}
        {v.payment === "disputed" && <p className="mt-3 text-[0.82rem] text-clay-deep">This payment is disputed, so the video is paused until it’s resolved.</p>}
        {v.note && <p className="mt-3 rounded-xl bg-paper px-3 py-2 text-[0.82rem] text-ink-soft">Your note: “{v.note}”</p>}
        {v.status === "ready" && (v.payment === "captured" || v.payment === "refunded") && (
          <a href={`/api/hugs/${token}/video/file?download`} className="mt-3 inline-flex h-10 items-center rounded-full border border-line px-4 text-sm">
            Download video
          </a>
        )}
        {v.status === "booked" && (
          <Button variant="quiet" size="sm" className="mt-3 -ml-3" onClick={() => confirm("Cancel this video? You won’t be charged.") && call("video", "DELETE")} disabled={busy}>
            Cancel video (no charge)
          </Button>
        )}
        {error && <p className="mt-3 text-[0.85rem] text-clay-deep">{error}</p>}
      </section>
    );
  }

  // ---- waiting on the free waitlist ----
  if (state.waitlist) {
    return (
      <section className="rounded-[1.6rem] border border-line bg-card/70 p-6">
        <p className="text-[0.7rem] font-medium uppercase tracking-[0.22em] text-clay">Free waitlist</p>
        <h2 className="mt-2 font-display text-[1.6rem] leading-tight tracking-[-0.02em]">
          You’re on the list. <span className="font-wonk">No charge.</span>
        </h2>
        <p className="mt-3 text-[0.9rem] leading-relaxed text-ink-soft">
          When a recording slot opens, we’ll hold it for you for 24 hours. Come back here to confirm, or ignore it and it passes to the next person.
        </p>
        <Button variant="quiet" size="sm" className="mt-3 -ml-3" onClick={() => call("waitlist", "DELETE")} disabled={busy}>
          Leave the waitlist
        </Button>
        {error && <p className="mt-3 text-[0.85rem] text-clay-deep">{error}</p>}
      </section>
    );
  }

  // ---- the offer ----
  const next = state.nextAvailable;
  return (
    <section className="overflow-hidden rounded-[1.6rem] bg-ink text-card">
      <div className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[0.7rem] font-medium uppercase tracking-[0.22em] text-blush">Founder video · {PRICE}</p>
            <h2 className="mt-2 font-display text-[1.6rem] leading-[1.1] tracking-[-0.02em]">
              Hear it <span className="font-wonk text-blush">out loud.</span>
            </h2>
          </div>
          <HugMark className="h-8 w-8 shrink-0 text-blush" />
        </div>
        <p className="mt-3 text-[0.92rem] leading-relaxed text-card/75">
          Our founder reads this hug to {recipient} on camera, by hand — 30 to 60 seconds. Five recordings per recording day. Delivered videos stay available for 30 days; download to keep.
        </p>
        {v?.status === "canceled" && (
          <p className="mt-3 rounded-xl bg-card/10 px-3 py-2 text-[0.82rem] text-card/80">
            Your last video was cancelled ({v.canceledReason ?? "no reason given"}). You weren’t charged.
          </p>
        )}

        <p className="mt-5 flex items-center gap-2 text-[0.88rem] text-card/85">
          <span className={`h-2 w-2 rounded-full ${next ? "bg-[#9fd49a]" : "bg-blush"}`} />
          {next
            ? `Next recording day: ${when(next.day)} · ${next.remaining} ${next.remaining === 1 ? "slot" : "slots"} left`
            : state.paused
              ? "The studio is taking a short break."
              : "Every recording day in the next week is full."}
        </p>

        {open && <NoteField note={note} setNote={setNote} />}

        <div className="mt-5 flex flex-col gap-3">
          {next ? (
            open ? (
              <Button onClick={() => call("video", "POST", { note })} disabled={busy} className="w-full">
                {busy ? "Booking…" : `Book ${when(next.day)} · ${PRICE}`}
              </Button>
            ) : (
              <Button onClick={() => setOpen(true)} className="w-full">
                Add a founder video · {PRICE}
              </Button>
            )
          ) : open ? (
            <Button onClick={() => call("waitlist", "POST", { note })} disabled={busy} className="w-full">
              {busy ? "Joining…" : "Join the free waitlist"}
            </Button>
          ) : (
            <Button onClick={() => setOpen(true)} className="w-full">
              Join the free waitlist
            </Button>
          )}
          <p className="text-center text-[0.78rem] text-card/60">
            {next
              ? `By saving a card you authorize Word Hug to charge ${PRICE} once your video is recorded and uploaded. Cancel free any time before recording. Beta test mode.`
              : "Free to join. You only pay if you book a slot."}
          </p>
          {error && <p className="text-[0.85rem] text-blush">{error}</p>}
        </div>
      </div>
    </section>
  );
}
