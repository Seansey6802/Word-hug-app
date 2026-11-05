"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/Button";
import { saveHug } from "@/lib/client/my-hugs";

type Recovered = { token: string; ownerKey: string; headline: string; createdAt: string; forSelf: boolean; recipientName: string };

export function Recover() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sent" | "redeeming" | "done" | "error">("idle");
  const [msg, setMsg] = useState<string | null>(null);
  const [hugs, setHugs] = useState<Recovered[]>([]);

  // The one-time token arrives in the URL fragment, which is never sent to servers or logged.
  useEffect(() => {
    const onHash = () => redeemFromHash();
    redeemFromHash();
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  function redeemFromHash() {
    const m = /[#&]t=([A-Za-z0-9_-]{32,128})/.exec(window.location.hash);
    if (!m) return;
    history.replaceState(null, "", window.location.pathname);
    setState("redeeming");
    fetch("/api/recovery/redeem", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: m[1] }) })
      .then(async (r) => {
        const out = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(out.error ?? "That link didn’t work.");
        for (const h of out.hugs as Recovered[]) saveHug(h);
        setHugs(out.hugs);
        setState("done");
      })
      .catch((e) => {
        setMsg(e.message);
        setState("error");
      });
  }

  async function request(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    const r = await fetch("/api/recovery/request", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email }) });
    const out = await r.json().catch(() => ({}));
    if (!r.ok) return setMsg(out.error ?? "That didn’t work.");
    setState("sent");
  }

  if (state === "redeeming") return <p className="mt-8 text-ink-soft">Unwrapping…</p>;
  if (state === "done")
    return (
      <div className="mt-8">
        <p className="text-ink-soft">
          Welcome back. {hugs.length} {hugs.length === 1 ? "hug is" : "hugs are"} on this device again. Your old device can no longer change them.
        </p>
        <ul className="mt-6 divide-y divide-line border-y border-line">
          {hugs.map((h) => (
            <li key={h.token} className="py-3">
              <Link href={`/h/${h.token}`} className="font-display text-[1.15rem]">{h.headline}</Link>
            </li>
          ))}
        </ul>
      </div>
    );
  if (state === "sent")
    return (
      <p className="mt-8 rounded-2xl bg-card px-5 py-4 text-ink-soft">
        If that email has hugs, a recovery link is on its way. It works once and expires in 30 minutes. Open it on this device.
      </p>
    );
  return (
    <form onSubmit={request} className="mt-6">
      <p className="text-ink-soft">Lost your phone, or cleared your browser? If you added a recovery email to a hug, we’ll send you a one-time link.</p>
      <input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        autoComplete="email"
        placeholder="you@example.com"
        className="mt-6 w-full rounded-2xl border border-line bg-card px-4 py-3.5 focus:border-ink/40 focus:outline-none"
      />
      <Button type="submit" disabled={!email} className="mt-4 w-full">Send recovery link</Button>
      {(msg || state === "error") && <p className="mt-3 text-[0.9rem] text-clay-deep">{msg}</p>}
    </form>
  );
}
