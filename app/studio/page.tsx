import type { Metadata } from "next";
import { isStudio } from "@/lib/server/studio";
import { Wordmark } from "@/components/Wordmark";
import { StudioLogin } from "./StudioLogin";
import { StudioDashboard } from "./StudioDashboard";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Studio", robots: { index: false, follow: false } };

export default async function StudioPage() {
  const ok = await isStudio();
  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-3">
        <Wordmark />
        <span className="rounded-full bg-ink px-3 py-1 text-[0.7rem] font-medium uppercase tracking-[0.18em] text-card">Studio</span>
      </header>
      <main className="mx-auto max-w-3xl px-5 pb-24">{ok ? <StudioDashboard /> : <StudioLogin />}</main>
    </div>
  );
}
