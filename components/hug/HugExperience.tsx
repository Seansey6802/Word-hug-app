"use client";

import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button, ButtonLink } from "@/components/Button";
import { Envelope } from "./Envelope";
import { Letter, revealDuration } from "./Letter";
import { VideoPanel } from "./VideoPanel";
import { forgetHug, markSeen, ownerKeyFor, saveHug, seenLines } from "@/lib/client/my-hugs";
import { renderHugImage } from "@/lib/client/card-image";
import type { OwnerState, PublicHug } from "@/lib/types";
import { KeepSafe } from "./KeepSafe";

function useToast() {
  const [msg, setMsg] = useState<string | null>(null);
  const t = useRef<ReturnType<typeof setTimeout>>(undefined);
  const show = useCallback((m: string) => {
    setMsg(m);
    clearTimeout(t.current);
    t.current = setTimeout(() => setMsg(null), 2200);
  }, []);
  const node = (
    <AnimatePresence>
      {msg && (
        <motion.div
          role="status"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 16 }}
          className="fixed inset-x-0 bottom-[max(1.5rem,env(safe-area-inset-bottom))] z-50 mx-auto w-fit rounded-full bg-ink px-5 py-3 text-[0.9rem] text-card shadow-xl"
        >
          {msg}
        </motion.div>
      )}
    </AnimatePresence>
  );
  return { show, node };
}

export function HugExperience({ initial, isNew }: { initial: PublicHug; isNew: boolean }) {
  const router = useRouter();
  const [hug, setHug] = useState(initial);
  const [ownerKey, setOwnerKey] = useState<string | null>(null);
  const [owner, setOwner] = useState<OwnerState | null>(null);
  const [stage, setStage] = useState<"sealed" | "opening" | "open">("sealed");
  const [revealed, setRevealed] = useState(false);
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [photoGone, setPhotoGone] = useState(false);
  const toast = useToast();

  // Identify the owner from this device only. Also accept #k=… for opening on another device.
  useEffect(() => {
    const m = /[#&]k=([A-Za-z0-9_-]{20,})/.exec(window.location.hash);
    if (m) {
      saveHug({ token: initial.token, ownerKey: m[1], headline: initial.content.headline, createdAt: initial.createdAt, forSelf: initial.forSelf, recipientName: initial.recipientName });
      history.replaceState(null, "", window.location.pathname);
    }
    const key = ownerKeyFor(initial.token) ?? null;
    setOwnerKey(key);
    if (!key) {
      saveHug({ token: initial.token, headline: initial.content.headline, createdAt: initial.createdAt, forSelf: initial.forSelf, recipientName: initial.recipientName, received: true });
    }
    if (isNew) history.replaceState(null, "", window.location.pathname);
  }, [initial, isNew]);

  const loadOwner = useCallback(async () => {
    if (!ownerKey) return;
    const res = await fetch(`/api/hugs/${hug.token}`, { headers: { "x-owner-key": ownerKey } });
    if (res.ok) {
      const o = (await res.json()) as OwnerState;
      setOwner(o);
      setHug((h) => ({ ...h, videoReady: o.video?.status === "ready" }));
    } else if (res.status === 403) {
      // This device's key was rotated (e.g. recovered on another device).
      setOwnerKey(null);
    }
  }, [ownerKey, hug.token]);

  useEffect(() => {
    loadOwner();
  }, [loadOwner]);

  // Back from video checkout: reconcile (same check as the webhook), then clean the URL.
  useEffect(() => {
    if (!ownerKey) return;
    const sp = new URLSearchParams(window.location.search);
    const vc = sp.get("video_checkout");
    if (!vc) return;
    history.replaceState(null, "", window.location.pathname);
    if (vc === "canceled") {
      toast.show("Checkout cancelled — nothing was charged.");
      return;
    }
    (async () => {
      for (let i = 0; i < 10; i++) {
        const r = await fetch(`/api/hugs/${hug.token}/video`, { method: "POST", headers: { "content-type": "application/json", "x-owner-key": ownerKey }, body: JSON.stringify({ confirm: vc }) });
        const out = await r.json().catch(() => ({}));
        if (out.state) setOwner(out.state);
        if (out.checkout && out.checkout !== "pending") {
          if (out.checkout === "hold_expired") toast.show("That slot expired before checkout finished. Nothing was charged.");
          return;
        }
        await new Promise((res) => setTimeout(res, 1000));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownerKey, hug.token]);

  // Gentle polling while a video is in progress.
  useEffect(() => {
    const s = owner?.video?.status;
    const active = s === "held" || s === "booked" || s === "recording" || Boolean(owner?.waitlist);
    if (!active) return;
    const id = setInterval(loadOwner, 15000);
    return () => clearInterval(id);
  }, [owner?.video?.status, owner?.waitlist, loadOwner]);

  function open() {
    setStage("opening");
    setTimeout(() => setStage("open"), 1150);
    const ms = revealDuration(hug.content.paragraphs.length, hug.content.headline.split(" ").length) * 1000 + 1150;
    setTimeout(() => setRevealed(true), ms);
  }

  const giftUrl = typeof window !== "undefined" ? `${window.location.origin}/h/${hug.token}` : `/h/${hug.token}`;
  const signature = hug.senderName ? `— with love, ${hug.senderName}` : hug.forSelf ? "— with love, Word Hug" : "— with love, someone who thinks you’re great";
  const plain = `${hug.content.headline}\n\n${hug.content.paragraphs.join("\n\n")}\n\n${signature}`;
  const isOwner = Boolean(ownerKey);
  const giftForOther = !hug.forSelf;

  async function copyText() {
    try {
      await navigator.clipboard.writeText(plain);
      toast.show("Copied. Paste it somewhere lovely.");
    } catch {
      toast.show("Couldn’t copy — try long-pressing the text.");
    }
  }

  async function shareLink() {
    const data = {
      title: "A Word Hug",
      text: giftForOther ? `${hug.recipientName ? hug.recipientName + ", s" : "S"}omeone sent you a Word Hug.` : "Sometimes you just need a Word Hug.",
      url: giftUrl,
    };
    try {
      if (navigator.share) await navigator.share(data);
      else {
        await navigator.clipboard.writeText(giftUrl);
        toast.show("Private link copied.");
      }
    } catch {
      /* user dismissed the share sheet */
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(giftUrl);
      toast.show("Private gift link copied.");
    } catch {
      toast.show(giftUrl);
    }
  }

  async function saveImage() {
    setBusy("image");
    try {
      const blob = await renderHugImage({ kicker: hug.content.kicker, headline: hug.content.headline, paragraphs: hug.content.paragraphs, signature });
      const file = new File([blob], "word-hug.png", { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: "A Word Hug" }).catch(() => undefined);
      } else {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "word-hug.png";
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
        toast.show("Saved as an image.");
      }
    } finally {
      setBusy(null);
    }
  }

  async function rewrite() {
    if (!ownerKey) return;
    setBusy("rewrite");
    const res = await fetch(`/api/hugs/${hug.token}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", "x-owner-key": ownerKey },
      body: JSON.stringify({ avoid: seenLines() }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) return toast.show(body.error ?? "Couldn’t rewrite it.");
    markSeen(body.lineIds ?? []);
    setHug((h) => ({ ...h, content: body.content }));
    setVersion((v) => v + 1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function deletePhoto() {
    if (!ownerKey || !confirm("Delete the photo from this hug? This can’t be undone.")) return;
    const res = await fetch(`/api/hugs/${hug.token}/photo`, { method: "DELETE", headers: { "x-owner-key": ownerKey } });
    if (res.ok) {
      setPhotoGone(true);
      setHug((h) => ({ ...h, hasPhoto: false }));
      toast.show("Photo deleted.");
      loadOwner();
    }
  }

  async function deleteHug() {
    if (!ownerKey || !confirm("Delete this Word Hug for good? The gift link will stop working, and any photo or video goes with it.")) return;
    const res = await fetch(`/api/hugs/${hug.token}`, { method: "DELETE", headers: { "x-owner-key": ownerKey } });
    if (res.ok) {
      forgetHug(hug.token);
      router.push("/saved?deleted=1");
    }
  }

  const photoSrc = hug.hasPhoto && !photoGone ? `/api/hugs/${hug.token}/photo` : null;
  const toName = hug.recipientName || (hug.forSelf ? "you" : "you");

  return (
    <div className="mx-auto w-full max-w-xl px-5 pb-24">
      <AnimatePresence mode="wait">
        {stage !== "open" ? (
          <motion.div key="env" exit={{ opacity: 0 }} className="flex min-h-[70dvh] flex-col items-center justify-center pt-6">
            <motion.p initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mb-10 text-center font-display text-[1.6rem] leading-tight tracking-[-0.02em] text-balance">
              {isOwner && giftForOther
                ? <>Here’s what <span className="font-wonk">{hug.recipientName || "they"}</span> will see.</>
                : isOwner
                  ? <>Your Word Hug is <span className="font-wonk">ready.</span></>
                  : <>Someone sent you a <span className="font-wonk text-clay">Word Hug.</span></>}
            </motion.p>
            <Envelope to={toName} from={hug.senderName || undefined} opening={stage === "opening"} onOpen={open} />
          </motion.div>
        ) : (
          <motion.div key="letter" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="pt-4">
            {hug.videoReady && (
              <motion.section initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-6 overflow-hidden rounded-[1.6rem] bg-ink">
                <video src={`/api/hugs/${hug.token}/video/file`} controls playsInline preload="metadata" className="aspect-[9/16] max-h-[70dvh] w-full bg-ink object-contain" />
                <div className="flex items-center justify-between gap-3 px-5 py-3 text-[0.85rem] text-card/75">
                  <p>
                    Recorded by hand for {hug.recipientName || "you"}.
                    {hug.videoExpiresAt && <> Available until {new Date(hug.videoExpiresAt).toLocaleDateString("en-US", { month: "long", day: "numeric" })}.</>}
                  </p>
                  <a href={`/api/hugs/${hug.token}/video/file?download`} className="shrink-0 rounded-full border border-card/25 px-3 py-1.5 text-card">
                    Download
                  </a>
                </div>
              </motion.section>
            )}

            <Letter
              kicker={hug.content.kicker}
              headline={hug.content.headline}
              paragraphs={hug.content.paragraphs}
              signature={signature}
              photoSrc={photoSrc}
              version={version}
            />

            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={revealed || version > 0 ? { opacity: 1, y: 0 } : { opacity: 0, y: 12 }}
              transition={{ duration: 0.6 }}
              className="mt-6 space-y-6"
            >
              {/* save · copy · share */}
              <div className="grid grid-cols-3 gap-2">
                <Button variant="ghost" size="md" onClick={saveImage} disabled={busy === "image"} className="px-2">
                  {busy === "image" ? "Saving…" : "Save"}
                </Button>
                <Button variant="ghost" size="md" onClick={copyText} className="px-2">Copy</Button>
                <Button variant="ghost" size="md" onClick={shareLink} className="px-2">Share</Button>
              </div>

              {isOwner ? (
                <>
                  {giftForOther && (
                    <section className="rounded-[1.6rem] border border-line bg-card/70 p-6">
                      <p className="text-[0.7rem] font-medium uppercase tracking-[0.22em] text-clay">Private gift link</p>
                      <h2 className="mt-2 font-display text-[1.5rem] leading-tight tracking-[-0.02em]">
                        Send it to <span className="font-wonk">{hug.recipientName || "them"}.</span>
                      </h2>
                      <p className="mt-2 text-[0.9rem] text-ink-soft">Only people with this link can open it. It’s never listed or searchable.</p>
                      <div className="mt-4 flex items-center gap-2 rounded-2xl border border-line bg-paper px-4 py-3">
                        <span className="min-w-0 flex-1 truncate font-mono text-[0.8rem] text-ink-soft">{giftUrl.replace(/^https?:\/\//, "")}</span>
                        <button onClick={copyLink} className="shrink-0 text-[0.85rem] font-medium text-clay">Copy</button>
                      </div>
                      <Button onClick={shareLink} className="mt-4 w-full">Send the hug</Button>
                    </section>
                  )}

                  <VideoPanel
                    token={hug.token}
                    ownerKey={ownerKey!}
                    state={owner}
                    recipient={hug.forSelf ? "you" : hug.recipientName || "them"}
                    onState={(o) => {
                      setOwner(o);
                      setHug((h) => ({ ...h, videoReady: o.video?.status === "ready" }));
                    }}
                  />

                  {!(owner?.video && owner.video.status !== "canceled") && (
                    <div className="text-center">
                      <Button variant="quiet" onClick={rewrite} disabled={busy === "rewrite"}>
                        {busy === "rewrite" ? "Rewriting…" : "Not quite right? Write another version ↻"}
                      </Button>
                    </div>
                  )}

                  {owner && <KeepSafe token={hug.token} ownerKey={ownerKey!} has={owner.hasRecoveryEmail} onSaved={loadOwner} />}

                  <details className="group rounded-[1.4rem] border border-line px-5 py-4 text-[0.9rem]">
                    <summary className="flex cursor-pointer list-none items-center justify-between font-medium">
                      Privacy &amp; deletion
                      <span className="text-ink-faint transition-transform group-open:rotate-45">+</span>
                    </summary>
                    <div className="mt-4 space-y-3 text-ink-soft">
                      {hug.hasPhoto && !photoGone ? (
                        <>
                          <p>
                            Your photo is stored privately and shown only on this hug.
                            {owner?.photo && <> It deletes itself on {new Date(owner.photo.expiresAt).toLocaleDateString(undefined, { month: "long", day: "numeric" })}.</>}
                            {owner?.photo?.allowForVideo ? " You’ve allowed the founder to see it for a video." : ""}
                          </p>
                          <Button variant="ghost" size="sm" onClick={deletePhoto}>Delete photo now</Button>
                        </>
                      ) : (
                        <p>No photo is stored with this hug.</p>
                      )}
                      <p className="pt-2">Deleting the hug removes the words, the link, any photo and any video, permanently.</p>
                      <Button variant="ghost" size="sm" onClick={deleteHug} className="text-clay-deep">Delete this hug</Button>
                    </div>
                  </details>
                </>
              ) : (
                <section className="rounded-[1.6rem] border border-line bg-card/70 p-6 text-center">
                  <h2 className="font-display text-[1.5rem] leading-tight tracking-[-0.02em]">
                    Feeling hugged? <span className="font-wonk">Pass it on.</span>
                  </h2>
                  <p className="mt-2 text-[0.9rem] text-ink-soft">Somebody you know could use one too.</p>
                  <ButtonLink href="/create" className="mt-5 w-full">Get a Word Hug</ButtonLink>
                </section>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      {toast.node}
    </div>
  );
}
