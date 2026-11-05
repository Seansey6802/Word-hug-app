// Composes a Word Hug from the hand-written line library.
// Deterministic for a given seed, tone-aware, intensity-aware, and it avoids
// lines the person has recently seen. No network, no paid APIs, and it never
// receives a photo — so it cannot infer anything from one.

import { CATEGORY_INFO, type Category, type Intensity, type Occasion, type Tone } from "../catalog.ts";
import { BODY, CLOSERS, INTERESTS, OCCASION_LINES, OPENERS, type Line } from "./lines.ts";

export type ComposeInput = {
  category: Category;
  tone: Tone;
  intensity: Intensity;
  name?: string;
  interests?: string[];
  occasion?: Occasion;
  /** Line ids to avoid if possible (recently seen). */
  avoid?: string[];
  seed: number;
};

export type ComposedHug = {
  headline: string;
  kicker: string;
  paragraphs: string[];
  lineIds: string[];
};

function rng(seed: number) {
  // mulberry32
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function fitsIntensity(l: Line, intensity: Intensity) {
  const [lo, hi] = l.i ?? [1, 3];
  return intensity >= lo && intensity <= hi;
}

/** Weighted pick: tone matches count triple, unseen lines count far more. */
function pick<T extends { id: string; t?: Tone[] }>(
  items: T[],
  tone: Tone,
  avoid: Set<string>,
  rand: () => number,
): T {
  const weights = items.map((x) => {
    let w = !x.t || x.t.includes(tone) ? 3 : 1;
    if (avoid.has(x.id)) w *= 0.05;
    return w;
  });
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rand() * total;
  for (let k = 0; k < items.length; k++) {
    r -= weights[k];
    if (r <= 0) return items[k];
  }
  return items[items.length - 1];
}

export function cleanName(raw?: string) {
  const n = (raw ?? "").replace(/[<>{}]/g, "").replace(/\s+/g, " ").trim().slice(0, 40);
  return n;
}

export function cleanInterests(raw?: string[]) {
  return (raw ?? [])
    .map((s) => s.replace(/[<>{}]/g, "").replace(/\s+/g, " ").trim().slice(0, 40))
    .filter(Boolean)
    .slice(0, 5);
}

function joinInterests(list: string[]) {
  if (list.length <= 1) return list[0] ?? "";
  return `${list[0]} and ${list[1]}`;
}

/** Straight quotes in, typographic quotes out. */
export function smarten(s: string) {
  return s
    .replace(/(^|[\s(\[—-])'/g, "$1‘")
    .replace(/'/g, "’")
    .replace(/(^|[\s(\[—-])"/g, "$1“")
    .replace(/"/g, "”");
}

export function compose(input: ComposeInput): ComposedHug {
  const rand = rng(input.seed);
  const avoid = new Set(input.avoid ?? []);
  const name = cleanName(input.name);
  const interests = cleanInterests(input.interests);
  const used: string[] = [];

  // 1. Opener — category-flavoured openers get a gentle boost.
  const openers = OPENERS.filter((o) => !o.c || o.c.includes(input.category)).filter((o) =>
    o.t.includes(input.tone),
  );
  const opener = pick(openers.length ? openers : OPENERS, input.tone, avoid, rand);
  used.push(opener.id);
  const openerText = name ? opener.withName.replaceAll("{name}", name) : opener.without;

  // 2. Body — one or two lines, fewer when we have personal material.
  const personalCount = (input.occasion ? 1 : 0) + (interests.length ? 1 : 0);
  const bodyCount = personalCount >= 2 ? 1 : 2;
  const pool = BODY[input.category].filter((l) => fitsIntensity(l, input.intensity));
  const body: string[] = [];
  const remaining = [...pool];
  for (let k = 0; k < bodyCount && remaining.length; k++) {
    const l = pick(remaining, input.tone, avoid, rand);
    remaining.splice(remaining.indexOf(l), 1);
    used.push(l.id);
    body.push(l.text);
  }

  // 3. Personal — occasion and/or interests.
  const personal: string[] = [];
  if (input.occasion) {
    personal.push(OCCASION_LINES[input.category][input.occasion]);
    used.push(`oc-${input.category}-${input.occasion}`);
  }
  if (interests.length) {
    const l = pick(INTERESTS[input.category], input.tone, avoid, rand);
    used.push(l.id);
    personal.push(l.text.replaceAll("{i}", joinInterests(interests)));
  }

  // 4. Closer.
  const closer = pick(CLOSERS[input.category], input.tone, avoid, rand);
  used.push(closer.id);

  const paragraphs = [openerText, body.join(" "), personal.join(" "), closer.text]
    .filter(Boolean)
    .map(smarten);

  const info = CATEGORY_INFO[input.category];
  return {
    headline: name ? `A Word Hug for ${name}` : "A Word Hug, just for you",
    kicker: `${info.short} · ${info.intensity[input.intensity - 1]}`,
    paragraphs,
    lineIds: used,
  };
}

export function plainText(h: Pick<ComposedHug, "headline" | "paragraphs">, from?: string) {
  const sign = from ? `\n\n— with love, ${from}` : "";
  return `${h.headline}\n\n${h.paragraphs.join("\n\n")}${sign}\n\n(Sometimes you just need a Word Hug.)`;
}
