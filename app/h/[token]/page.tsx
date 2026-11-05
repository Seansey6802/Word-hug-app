import type { Metadata } from "next";
import { HugExperience } from "@/components/hug/HugExperience";
import { SiteHeader } from "@/components/SiteHeader";
import { ButtonLink } from "@/components/Button";
import { getHugByToken, read } from "@/lib/server/store";
import { toPublic } from "@/lib/server/hugs";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "A Word Hug for you",
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
};

type Props = { params: Promise<{ token: string }>; searchParams: Promise<{ new?: string }> };

export default async function HugPage({ params, searchParams }: Props) {
  const { token } = await params;
  const { new: isNew } = await searchParams;
  const hug = await getHugByToken(token);

  if (!hug) {
    return (
      <>
        <SiteHeader />
        <main className="mx-auto flex min-h-[70dvh] max-w-md flex-col items-center justify-center px-6 text-center">
          <h1 className="font-display text-[2.4rem] leading-tight tracking-[-0.03em]">
            This hug has been <span className="font-wonk">let go.</span>
          </h1>
          <p className="mt-4 text-ink-soft">It was deleted by the person who made it, or the link isn’t quite right.</p>
          <ButtonLink href="/create" className="mt-8">Get a Word Hug</ButtonLink>
        </main>
      </>
    );
  }

  const pub = await read((db) => toPublic(db, hug));
  return (
    <>
      <SiteHeader />
      <main>
        <HugExperience initial={pub} isNew={isNew === "1"} />
      </main>
    </>
  );
}
