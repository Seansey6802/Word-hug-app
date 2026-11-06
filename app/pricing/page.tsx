import type { Metadata } from "next";
import { SiteFooter, SiteHeader } from "@/components/SiteHeader";
import { ButtonLink } from "@/components/Button";
import { DEFAULT_VIDEO_CAPACITY, PRODUCTS, formatPrice } from "@/lib/commerce/products";

export const metadata: Metadata = { title: "Pricing" };

export default function PricingPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl px-5 pt-6 sm:px-8">
        <h1 className="font-display text-[2.6rem] leading-[1] tracking-[-0.03em] sm:text-[3.4rem]">
          Small prices for <span className="font-wonk">big feelings.</span>
        </h1>
        <p className="mt-4 max-w-lg text-ink-soft">
          Payments are handled securely by Stripe. During the private beta, checkout runs in Stripe test mode, so no real money moves. Bundles and subscriptions are coming later.
        </p>
        <ul className="mt-10 divide-y divide-line border-y border-line">
          {PRODUCTS.filter((p) => !p.deferred).map((p) => (
            <li key={p.sku} className="flex items-start justify-between gap-6 py-6">
              <div>
                <p className="font-display text-[1.35rem] leading-tight">{p.name}</p>
                <p className="mt-1 text-[0.93rem] text-ink-soft">{p.description}</p>
                {p.kind === "video" && (
                  <p className="mt-1 text-[0.85rem] text-ink-faint">
                    30–60 seconds. Up to {DEFAULT_VIDEO_CAPACITY} per recording day, booked up to 7 days ahead. Charged only once your video is recorded and uploaded. Available to watch and download for 30 days after delivery.
                  </p>
                )}
                <p className={`mt-2 text-[0.72rem] font-medium uppercase tracking-[0.18em] ${p.available ? "text-clay" : "text-ink-faint"}`}>
                  {p.available ? "Available in the beta" : "Coming soon"}
                </p>
              </div>
              <p className="shrink-0 font-display text-[1.6rem]">
                {formatPrice(p.amountCents)}
                {p.interval && <span className="text-base text-ink-faint">/{p.interval === "month" ? "mo" : p.interval}</span>}
              </p>
            </li>
          ))}
        </ul>
        <ButtonLink href="/create" size="lg" className="mt-10 w-full sm:w-auto">Get a Word Hug</ButtonLink>
      </main>
      <SiteFooter />
    </>
  );
}
