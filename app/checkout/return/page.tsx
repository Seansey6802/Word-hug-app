import type { Metadata } from "next";
import { SiteHeader } from "@/components/SiteHeader";
import { CheckoutReturn } from "./CheckoutReturn";

export const metadata: Metadata = { title: "Wrapping your hug", robots: { index: false }, referrer: "no-referrer" };

export default function Page() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex min-h-[70dvh] max-w-md flex-col items-center justify-center px-6 text-center">
        <CheckoutReturn />
      </main>
    </>
  );
}
