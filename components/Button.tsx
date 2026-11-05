import Link from "next/link";
import type { ComponentProps } from "react";

const base =
  "inline-flex items-center justify-center gap-2 rounded-full font-medium transition-all duration-300 ease-hug active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40 select-none";
const variants = {
  primary:
    "bg-clay text-card shadow-[0_1px_0_rgb(255_255_255/.25)_inset,0_10px_30px_-12px_rgb(140_51_29/.65)] hover:bg-clay-deep",
  ink: "bg-ink text-card hover:bg-ink/90",
  ghost: "border border-line bg-card/60 text-ink hover:bg-card hover:border-ink/25",
  quiet: "text-ink-soft hover:text-ink",
};
const sizes = { lg: "h-14 px-8 text-[1.05rem]", md: "h-12 px-6 text-[0.98rem]", sm: "h-10 px-4 text-sm" };

type V = { variant?: keyof typeof variants; size?: keyof typeof sizes };

export function Button({ variant = "primary", size = "md", className = "", ...p }: ComponentProps<"button"> & V) {
  return <button className={`${base} ${variants[variant]} ${sizes[size]} ${className}`} {...p} />;
}

export function ButtonLink({ variant = "primary", size = "md", className = "", ...p }: ComponentProps<typeof Link> & V) {
  return <Link className={`${base} ${variants[variant]} ${sizes[size]} ${className}`} {...p} />;
}
