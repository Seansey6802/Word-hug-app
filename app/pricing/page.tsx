import type { Metadata } from "next";
import { SiteFooter, SiteHeader } from "@/components/SiteHeader";
import { ButtonLink } from "@/components/Button";
import { PRODUCTS, formatPrice } from "@/lib/commerce/products";

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
          During the preview, written hugs are free and video orders are demo-only. When we launch, payments will be handled securely by Stripe.
        </p>
        <ul className="mt-10 divide-y divide-line border-y border-line">
          {PRODUCTS.map((p) => (
            <li key={p.sku} className="flex items-start justify-between gap-6 py-6">
              <div>
                <p className="font-display text-[1.35rem] leading-tight">{p.name}</p>
                <p className="mt-1 text-[0.93rem] text-ink-soft">{p.description}</p>
                <p className={`mt-2 text-[0.72rem] font-medium uppercase tracking-[0.18em] ${p.available ? "text-clay" : "text-ink-faint"}`}>
                  {p.available ? "In the preview" : "Coming soon"}
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
