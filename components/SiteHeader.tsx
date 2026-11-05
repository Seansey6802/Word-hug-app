import Link from "next/link";
import { Wordmark } from "./Wordmark";

export function SiteHeader({ right }: { right?: React.ReactNode }) {
  return (
    <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-3 sm:px-8">
      <Wordmark />
      {right ?? (
        <Link href="/saved" className="text-sm text-ink-soft underline-offset-4 hover:text-ink hover:underline">
          My hugs
        </Link>
      )}
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mx-auto mt-24 w-full max-w-6xl border-t border-line px-5 py-10 text-sm text-ink-faint sm:px-8">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-display text-lg text-ink">Sometimes you just need a Word Hug.</p>
          <p className="mt-1">Prototype preview · Demo data only · Nothing is charged.</p>
        </div>
        <nav className="flex flex-wrap gap-x-5 gap-y-2">
          <Link href="/pricing" className="hover:text-ink">Pricing</Link>
          <Link href="/privacy" className="hover:text-ink">Privacy</Link>
          <Link href="/saved" className="hover:text-ink">My hugs</Link>
          <Link href="/studio" className="hover:text-ink">Studio</Link>
        </nav>
      </div>
      <p className="mt-6 text-xs">Photography via Unsplash. No dogs were rushed.</p>
    </footer>
  );
}
