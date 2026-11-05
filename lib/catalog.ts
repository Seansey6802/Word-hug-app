// The shape of the product: kinds of hug, tones, intensities, occasions.
// Kept in one place so copy, validation and the database agree.

export const CATEGORIES = ["encourage", "roast", "flirt", "laugh"] as const;
export type Category = (typeof CATEGORIES)[number];

export const TONES = ["heartfelt", "playful", "poetic", "deadpan"] as const;
export type Tone = (typeof TONES)[number];

export type Intensity = 1 | 2 | 3;

export const OCCASIONS = [
  "tough_week",
  "big_day",
  "new_start",
  "birthday",
  "heartbreak",
  "win",
  "missing",
] as const;
export type Occasion = (typeof OCCASIONS)[number];

export const CATEGORY_INFO: Record<
  Category,
  {
    label: string;
    short: string;
    blurb: string;
    sample: string;
    intensity: [string, string, string];
  }
> = {
  encourage: {
    label: "Encourage Me",
    short: "Encouragement",
    blurb: "A pep talk with a spine. For big days, long weeks and wobbly Tuesdays.",
    sample:
      "You don’t have to feel ready. Ready is a feeling; brave is a decision, and you’ve made it before.",
    intensity: ["A gentle nudge", "A proper pep talk", "Full stadium"],
  },
  roast: {
    label: "Roast Me (With Love)",
    short: "Loving roast",
    blurb: "Affectionate, never cruel. We roast habits, not humans — and always end on a hug.",
    sample:
      "Your Notes app is a museum of brilliant ideas, one grocery list, and a sentence that just says ‘the thing with the guy.’",
    intensity: ["Lightly toasted", "Golden brown", "Extra crispy"],
  },
  flirt: {
    label: "Flirt With Me",
    short: "Pickup lines",
    blurb: "Gloriously cheesy pickup lines, delivered with total commitment and zero shame.",
    sample:
      "Are you a library book? Because I keep checking you out and I’m not giving you back on time.",
    intensity: ["Bashful", "Smooth", "Shameless"],
  },
  laugh: {
    label: "Make Me Laugh",
    short: "Pure nonsense",
    blurb: "Sincere nonsense. Ducks may be involved. It will, against the odds, help.",
    sample:
      "I asked a group of ducks what they think of you. They said ‘quack,’ which I’ve chosen to interpret as a standing ovation.",
    intensity: ["A smirk", "A real laugh", "Coffee out the nose"],
  },
};

export const TONE_INFO: Record<Tone, { label: string; hint: string }> = {
  heartfelt: { label: "Heartfelt", hint: "Warm and sincere" },
  playful: { label: "Playful", hint: "Bouncy, a little silly" },
  poetic: { label: "Poetic", hint: "Lyrical, chosen with care" },
  deadpan: { label: "Deadpan", hint: "Dry. Straight face. Big heart." },
};

export const OCCASION_INFO: Record<Occasion, string> = {
  tough_week: "Tough week",
  big_day: "Big day ahead",
  new_start: "New start",
  birthday: "Birthday",
  heartbreak: "Heartbreak",
  win: "Celebrating a win",
  missing: "Missing someone",
};

export function isCategory(v: unknown): v is Category {
  return typeof v === "string" && (CATEGORIES as readonly string[]).includes(v);
}
export function isTone(v: unknown): v is Tone {
  return typeof v === "string" && (TONES as readonly string[]).includes(v);
}
export function isOccasion(v: unknown): v is Occasion {
  return typeof v === "string" && (OCCASIONS as readonly string[]).includes(v);
}
export function isIntensity(v: unknown): v is Intensity {
  return v === 1 || v === 2 || v === 3;
}
