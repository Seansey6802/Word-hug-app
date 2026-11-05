// Future commerce catalogue. Prices are defined here once and will map to
// Stripe Price IDs later. Nothing in the prototype charges money.

export type ProductKind = "written" | "video" | "bundle" | "subscription";

export type Product = {
  sku: string;
  kind: ProductKind;
  name: string;
  description: string;
  amountCents: number;
  interval?: "month";
  credits?: { written?: number; video?: number };
  /** Filled in when Stripe is connected (never during the prototype). */
  stripePriceId?: string;
  available: boolean;
  /** Not planned for the first launch. Hidden from pricing UI. */
  deferred?: boolean;
};

/** Founder-recorded videos per recording day (studio can adjust). */
export const DEFAULT_VIDEO_CAPACITY = 5;

export const PRODUCTS: Product[] = [
  {
    sku: "hug_written",
    kind: "written",
    name: "Written Word Hug",
    description: "One personal message, written for you or someone you love.",
    amountCents: 100,
    available: true,
  },
  {
    sku: "hug_video",
    kind: "video",
    name: "Founder Video Word Hug",
    description: "Your hug, read out loud and recorded personally by our founder. By hand. On camera.",
    amountCents: 1500,
    available: true,
  },
  {
    sku: "bundle_pocketful",
    kind: "bundle",
    name: "A Pocketful",
    description: "Ten written hugs to hand out whenever someone needs one.",
    amountCents: 800,
    credits: { written: 10 },
    available: false,
  },
  {
    sku: "sub_weekly",
    kind: "subscription",
    name: "Weekly Word Hug",
    description: "A fresh written hug every Monday morning, for you or someone you choose.",
    amountCents: 300,
    interval: "month",
    available: false,
    deferred: true, // subscriptions are deferred until after launch
  },
];

export const product = (sku: string) => PRODUCTS.find((p) => p.sku === sku);

export const VIDEO_PRICE_CENTS = product("hug_video")!.amountCents;
export const WRITTEN_PRICE_CENTS = product("hug_written")!.amountCents;

export const formatPrice = (cents: number) =>
  cents % 100 === 0 ? `$${cents / 100}` : `$${(cents / 100).toFixed(2)}`;
