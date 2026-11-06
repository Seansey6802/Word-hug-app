import { notFound } from "next/navigation";
import { devPaymentsEnabled } from "@/lib/payments/dev";
import { fakeCheckoutInfo } from "@/lib/payments/fake-gateway";
import { formatPrice } from "@/lib/commerce/products";
import { FakePay } from "./FakePay";

export const dynamic = "force-dynamic";
export const metadata = { title: "Test checkout", robots: { index: false } };

/** LOCAL ONLY stand-in for Stripe Checkout (PAYMENTS_MODE=fake). Real test mode uses checkout.stripe.com. */
export default async function FakeCheckout({ params }: { params: Promise<{ id: string }> }) {
  if (!devPaymentsEnabled()) notFound();
  const s = fakeCheckoutInfo((await params).id);
  if (!s) notFound();
  return (
    <main className="mx-auto min-h-dvh max-w-md px-5 pt-10 pb-20">
      <p className="rounded-full bg-butter px-3 py-1 text-center text-[0.75rem] font-medium uppercase tracking-[0.16em]">Test checkout · no real money</p>
      <h1 className="mt-8 font-display text-[2rem] leading-tight">{s.name}</h1>
      <p className="mt-1 text-ink-soft">{s.description}</p>
      <p className="mt-6 font-display text-[2.4rem]">{s.mode === "setup" ? "$0.00 today" : formatPrice(s.amount)}</p>
      {s.status !== "open" ? <p className="mt-6 text-clay-deep">This checkout has {s.status === "complete" ? "already been completed" : "expired"}.</p> : <FakePay id={s.id} mode={s.mode} cancelUrl={s.cancelUrl} />}
    </main>
  );
}
