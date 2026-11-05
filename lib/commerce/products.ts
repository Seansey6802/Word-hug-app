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
};

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
    name: "Video Word Hug",
    description: "Your hug, read out loud and recorded by our founder. By hand. On camera.",
    amountCents: 500,
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
    sku: "bundle_big_squeeze",
    kind: "bundle",
    name: "The Big Squeeze",
    description: "Five written hugs and one video. For birthdays, send-offs and big days.",
    amountCents: 900,
    credits: { written: 5, video: 1 },
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
  },
];

export const product = (sku: string) => PRODUCTS.find((p) => p.sku === sku);

export const formatPrice = (cents: number) =>
  cents % 100 === 0 ? `$${cents / 100}` : `$${(cents / 100).toFixed(2)}`;
