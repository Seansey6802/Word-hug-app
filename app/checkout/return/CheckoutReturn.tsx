"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { HugMark } from "@/components/Wordmark";
import { ButtonLink } from "@/components/Button";
import { saveHug, takePending } from "@/lib/client/my-hugs";

/** Confirms the $1 payment with the server (same check as the webhook), then opens the hug. */
export function CheckoutReturn() {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    const sessionId = new URLSearchParams(window.location.search).get("session_id");
    if (!sessionId) return setMsg("We couldn't find your checkout.");
    let tries = 0;
    let stop = false;
    const tick = async () => {
      const r = await fetch("/api/checkout/confirm", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sessionId }) });
      const out = await r.json().catch(() => ({}));
      if (stop) return;
      if (out.state === "paid" && out.token) {
        const p = out.draftId ? takePending(out.draftId) : null;
        saveHug({
          token: out.token,
          ownerKey: p?.ownerKey,
          headline: out.headline ?? "A Word Hug",
          createdAt: new Date().toISOString(),
          forSelf: p?.forSelf ?? true,
          recipientName: p?.recipientName ?? "",
          received: !p,
        });
        router.replace(`/h/${out.token}?new=1`);
        return;
      }
      if (out.state === "expired") return setMsg("That checkout expired before payment, so nothing was charged.");
      if (++tries > 20) return setMsg("Payment is taking longer than usual. If you were charged, your hug will appear in “My hugs” shortly.");
      setTimeout(tick, 1000);
    };
    tick();
    return () => {
      stop = true;
    };
  }, [router]);

  return msg ? (
    <div>
      <p className="font-display text-[1.6rem] leading-tight">{msg}</p>
      <ButtonLink href="/create" className="mt-6">Start again</ButtonLink>
    </div>
  ) : (
    <div>
      <HugMark className="mx-auto h-10 w-10 animate-pulse text-clay" />
      <p className="mt-5 font-display text-[1.6rem] leading-tight">
        Payment received. <span className="font-wonk">Wrapping your hug…</span>
      </p>
    </div>
  );
}
