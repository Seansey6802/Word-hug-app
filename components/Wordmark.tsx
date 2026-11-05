import Link from "next/link";

/** The mark: two parentheses holding a dot — a word, being hugged. */
export function HugMark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden className={className}>
      <path d="M22 14c-8 5-12 11-12 18s4 13 12 18" fill="none" stroke="currentColor" strokeWidth="5.5" strokeLinecap="round" />
      <path d="M42 14c8 5 12 11 12 18s-4 13-12 18" fill="none" stroke="currentColor" strokeWidth="5.5" strokeLinecap="round" />
      <circle cx="32" cy="32" r="5.5" fill="currentColor" />
    </svg>
  );
}

export function Wordmark({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="group inline-flex items-center gap-2" aria-label="Word Hug home">
      <HugMark className="h-6 w-6 text-clay transition-transform duration-500 ease-hug group-hover:scale-110" />
      <span className="font-display text-[1.35rem] leading-none tracking-[-0.02em]">
        Word <span className="font-wonk">Hug</span>
      </span>
    </Link>
  );
}
