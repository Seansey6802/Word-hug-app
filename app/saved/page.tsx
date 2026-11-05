import type { Metadata } from "next";
import { SiteHeader, SiteFooter } from "@/components/SiteHeader";
import { SavedList } from "./SavedList";

export const metadata: Metadata = { title: "My hugs" };

export default function SavedPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-xl px-5 pt-6">
        <h1 className="font-display text-[2.6rem] leading-[1] tracking-[-0.03em]">
          My <span className="font-wonk">hugs.</span>
        </h1>
        <p className="mt-3 text-ink-soft">Hugs you’ve made or received on this device. They’re kept here, not in an account — so nobody else can see this list.</p>
        <SavedList />
      </main>
      <SiteFooter />
    </>
  );
}
