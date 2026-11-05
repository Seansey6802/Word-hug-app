"use client";

import { motion } from "motion/react";
import { HugMark } from "@/components/Wordmark";

const ease = [0.22, 1, 0.36, 1] as const;

export function Letter({
  kicker,
  headline,
  paragraphs,
  signature,
  photoSrc,
  animate = true,
  version = 0,
}: {
  kicker: string;
  headline: string;
  paragraphs: string[];
  signature: string;
  photoSrc?: string | null;
  animate?: boolean;
  version?: number;
}) {
  const words = headline.split(" ");
  const base = animate ? 0.15 : 0;
  const headlineDone = base + words.length * 0.06 + 0.3;

  return (
    <motion.article
      key={version}
      initial={animate ? { opacity: 0, y: 40, scale: 0.97 } : false}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.8, ease }}
      className="grain relative mx-auto w-full max-w-xl rounded-[2rem] bg-card px-7 pt-9 pb-8 shadow-[0_40px_90px_-40px_rgb(36_28_23/.5)] sm:px-12 sm:pt-12"
    >
      {/* soft bloom */}
      {animate && (
        <motion.div
          aria-hidden
          className="pointer-events-none absolute -inset-10 -z-10 rounded-[3rem] bg-[radial-gradient(closest-side,rgb(242_214_200/.9),transparent)]"
          initial={{ opacity: 0, scale: 0.7 }}
          animate={{ opacity: [0, 1, 0.5], scale: [0.7, 1.08, 1] }}
          transition={{ duration: 2.2, ease }}
        />
      )}

      <div className="relative z-10">
        <motion.p
          initial={animate ? { opacity: 0 } : false}
          animate={{ opacity: 1 }}
          transition={{ delay: base, duration: 0.6 }}
          className="text-[0.7rem] font-medium uppercase tracking-[0.22em] text-clay"
        >
          {kicker}
        </motion.p>

        {photoSrc && (
          <motion.div
            initial={animate ? { opacity: 0, rotate: 8, y: -10 } : false}
            animate={{ opacity: 1, rotate: 3, y: 0 }}
            transition={{ delay: headlineDone, type: "spring", bounce: 0.35, duration: 0.9 }}
            className="float-right mt-1 mb-3 ml-4 w-[38%] max-w-[10rem] rounded-md bg-white p-1.5 pb-5 shadow-[0_12px_30px_-12px_rgb(36_28_23/.45)]"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photoSrc} alt="A photo added to this hug" className="aspect-square w-full rounded-[3px] object-cover" />
          </motion.div>
        )}

        <h1 className="mt-4 font-display text-[2.15rem] leading-[1.02] tracking-[-0.03em] sm:text-[2.7rem]">
          {words.map((w, k) => (
            <motion.span
              key={`${w}-${k}`}
              className="inline-block"
              initial={animate ? { opacity: 0, y: 14, filter: "blur(8px)" } : false}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              transition={{ delay: base + k * 0.06, duration: 0.6, ease }}
            >
              {w}
              {k < words.length - 1 ? " " : ""}
            </motion.span>
          ))}
        </h1>

        <div className="mt-7 space-y-5">
          {paragraphs.map((p, k) => (
            <motion.p
              key={`${version}-${k}`}
              initial={animate ? { opacity: 0, y: 12, filter: "blur(6px)" } : false}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              transition={{ delay: headlineDone + 0.25 + k * 0.55, duration: 0.8, ease }}
              className={`font-display text-pretty leading-[1.45] tracking-[-0.005em] ${
                k === 0 ? "text-[1.2rem] text-ink-soft italic" : "text-[1.24rem] sm:text-[1.32rem]"
              }`}
            >
              {p}
            </motion.p>
          ))}
        </div>

        <motion.div
          initial={animate ? { opacity: 0 } : false}
          animate={{ opacity: 1 }}
          transition={{ delay: headlineDone + 0.4 + paragraphs.length * 0.55, duration: 0.8 }}
          className="mt-8 flex items-center justify-between border-t border-line pt-5"
        >
          <p className="font-wonk text-[1.2rem] text-ink-soft">{signature}</p>
          <HugMark className="h-6 w-6 text-clay" />
        </motion.div>
      </div>
    </motion.article>
  );
}

export function revealDuration(paragraphs: number, headlineWords: number) {
  return 0.15 + headlineWords * 0.06 + 0.3 + 0.4 + paragraphs * 0.55 + 0.6;
}
