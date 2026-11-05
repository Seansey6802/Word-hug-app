"use client";

import { motion } from "motion/react";
import { HugMark } from "@/components/Wordmark";

/** A sealed envelope. Tapping it breaks the seal, lifts the flap and hands over the letter. */
export function Envelope({
  to,
  from,
  opening,
  onOpen,
}: {
  to: string;
  from?: string;
  opening: boolean;
  onOpen: () => void;
}) {
  return (
    <div className="flex w-full flex-col items-center">
      <motion.button
        type="button"
        onClick={onOpen}
        disabled={opening}
        aria-label="Open your Word Hug"
        initial={{ opacity: 0, y: 30, rotate: -2 }}
        animate={opening ? { y: 40, scale: 0.96, opacity: 0, transition: { delay: 0.75, duration: 0.5 } } : { opacity: 1, y: 0, rotate: -1.5 }}
        whileTap={{ scale: 0.98 }}
        transition={{ type: "spring", bounce: 0.3, duration: 0.9 }}
        className="relative w-full max-w-[22rem] [perspective:1200px]"
      >
        {/* letter peeking out */}
        <motion.div
          aria-hidden
          className="absolute inset-x-5 top-4 h-[85%] rounded-xl bg-card shadow-sm"
          animate={opening ? { y: -120, transition: { delay: 0.35, duration: 0.6, ease: [0.22, 1, 0.36, 1] } } : { y: 0 }}
        />
        {/* body */}
        <div className="grain relative aspect-[4/3] overflow-hidden rounded-[1.4rem] bg-paper-2 shadow-[0_30px_70px_-30px_rgb(36_28_23/.55)]">
          <div
            aria-hidden
            className="absolute inset-0 bg-[#e9dccb]"
            style={{ clipPath: "polygon(0 100%, 50% 48%, 100% 100%)" }}
          />
          <div
            aria-hidden
            className="absolute inset-0 bg-[#e4d5c2]"
            style={{ clipPath: "polygon(0 0, 50% 52%, 0 100%)" }}
          />
          <div
            aria-hidden
            className="absolute inset-0 bg-[#e4d5c2]"
            style={{ clipPath: "polygon(100% 0, 50% 52%, 100% 100%)" }}
          />
          <div className="absolute inset-x-0 bottom-5 z-10 text-center">
            <p className="font-wonk text-[1.6rem] leading-none text-ink">For {to}</p>
            {from && <p className="mt-1.5 text-[0.8rem] uppercase tracking-[0.2em] text-ink-soft">from {from}</p>}
          </div>
        </div>
        {/* flap */}
        <motion.div
          aria-hidden
          className="absolute inset-x-0 top-0 z-20 h-[56%] origin-top"
          style={{ transformStyle: "preserve-3d" }}
          animate={opening ? { rotateX: 178, transition: { delay: 0.15, duration: 0.55, ease: [0.65, 0, 0.35, 1] } } : { rotateX: 0 }}
        >
          <div
            className="h-full w-full rounded-t-[1.4rem] bg-[#ddcbb5] [backface-visibility:hidden]"
            style={{ clipPath: "polygon(0 0, 100% 0, 50% 100%)" }}
          />
        </motion.div>
        {/* wax seal */}
        <motion.span
          aria-hidden
          className="absolute top-[56%] left-1/2 z-30 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-clay text-card shadow-[0_6px_16px_-4px_rgb(140_51_29/.7),inset_0_-3px_0_rgb(0_0_0/.15),inset_0_2px_0_rgb(255_255_255/.2)]"
          animate={opening ? { scale: [1, 1.15, 0], rotate: 25, opacity: [1, 1, 0], transition: { duration: 0.35 } } : { scale: 1 }}
        >
          <HugMark className="h-8 w-8" />
        </motion.span>
      </motion.button>

      <motion.p
        className="mt-8 text-[0.85rem] uppercase tracking-[0.22em] text-ink-faint"
        animate={opening ? { opacity: 0 } : { opacity: [0.45, 1, 0.45] }}
        transition={opening ? { duration: 0.2 } : { duration: 2.4, repeat: Infinity }}
      >
        Tap to open
      </motion.p>
    </div>
  );
}
