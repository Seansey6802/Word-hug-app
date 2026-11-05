"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ButtonLink } from "@/components/Button";
import { forgetHug, listHugs, type SavedHug } from "@/lib/client/my-hugs";

export function SavedList() {
  const [hugs, setHugs] = useState<SavedHug[] | null>(null);
  const [deleted, setDeleted] = useState(false);
  useEffect(() => {
    setHugs(listHugs());
    setDeleted(new URLSearchParams(window.location.search).has("deleted"));
  }, []);

  if (!hugs) return null;
  return (
    <div className="mt-8">
      {deleted && <p className="mb-6 rounded-2xl bg-card px-4 py-3 text-[0.92rem]">Deleted. The words, link and any photo or video are gone for good.</p>}
      {hugs.length === 0 ? (
        <div className="rounded-[1.6rem] border border-dashed border-ink/20 p-8 text-center">
          <p className="font-display text-xl">Nothing here yet.</p>
          <p className="mt-1 text-ink-soft">Which, frankly, is a situation we can fix.</p>
          <ButtonLink href="/create" className="mt-6">Get a Word Hug</ButtonLink>
        </div>
      ) : (
        <ul className="divide-y divide-line border-y border-line">
          {hugs.map((h) => (
            <li key={h.token} className="flex items-center gap-4 py-4">
              <Link href={`/h/${h.token}`} className="min-w-0 flex-1">
                <p className="truncate font-display text-[1.2rem]">{h.headline}</p>
                <p className="text-[0.82rem] text-ink-faint">
                  {h.received ? "Received" : h.forSelf ? "For you" : `Sent to ${h.recipientName || "someone"}`} ·{" "}
                  {new Date(h.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                </p>
              </Link>
              <button
                onClick={() => {
                  forgetHug(h.token);
                  setHugs(listHugs());
                }}
                className="text-[0.8rem] text-ink-faint hover:text-ink"
                aria-label={`Remove ${h.headline} from this list`}
              >
                Hide
              </button>
            </li>
          ))}
        </ul>
      )}
      {hugs.length > 0 && <p className="mt-4 text-[0.8rem] text-ink-faint">“Hide” only removes it from this device. To delete a hug you made, open it and use Privacy &amp; deletion.</p>}
    </div>
  );
}
