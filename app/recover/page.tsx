import type { Metadata } from "next";
import { SiteFooter, SiteHeader } from "@/components/SiteHeader";
import { Recover } from "./Recover";

export const metadata: Metadata = { title: "Recover your hugs", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default function RecoverPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-md px-5 pt-6">
        <h1 className="font-display text-[2.4rem] leading-[1] tracking-[-0.03em]">
          Get your hugs <span className="font-wonk">back.</span>
        </h1>
        <Recover />
      </main>
      <SiteFooter />
    </>
  );
}
