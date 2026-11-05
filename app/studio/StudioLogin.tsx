"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/Button";

export function StudioLogin() {
  const router = useRouter();
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/studio/session", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ passcode }) });
    setBusy(false);
    if (!res.ok) return setError((await res.json().catch(() => ({}))).error ?? "Nope.");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="mx-auto mt-16 max-w-sm">
      <h1 className="font-display text-[2.2rem] leading-tight tracking-[-0.03em]">
        The <span className="font-wonk">recording</span> studio.
      </h1>
      <p className="mt-2 text-ink-soft">For the founder only. Prototype passcode is in <code className="rounded bg-card px-1">.env.example</code>.</p>
      <input
        type="password"
        value={passcode}
        onChange={(e) => setPasscode(e.target.value)}
        autoComplete="current-password"
        placeholder="Passcode"
        className="mt-6 w-full rounded-2xl border border-line bg-card px-4 py-3.5 focus:border-ink/40 focus:outline-none"
      />
      {error && <p className="mt-3 text-[0.9rem] text-clay-deep">{error}</p>}
      <Button type="submit" disabled={busy || !passcode} className="mt-4 w-full">{busy ? "Checking…" : "Enter the studio"}</Button>
    </form>
  );
}
