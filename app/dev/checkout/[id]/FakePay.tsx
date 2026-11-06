"use client";

import { useState } from "react";
import { Button } from "@/components/Button";

const SETUP_CARDS = [
  ["pm_fake_ok", "Test card ending 4242 — works"],
  ["pm_fake_decline_later", "Test card — saves, declines later (insufficient funds)"],
  ["pm_fake_auth_later", "Test card — saves, bank asks for authentication later"],
  ["pm_fake_capture_fails", "Test card — authorization lapses before capture"],
];

export function FakePay({ id, mode, cancelUrl }: { id: string; mode: "payment" | "setup"; cancelUrl: string }) {
  const [choice, setChoice] = useState(mode === "setup" ? "pm_fake_ok" : "pay");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function go(c: string) {
    setBusy(true);
    setError(null);
    const r = await fetch("/api/dev/checkout", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sessionId: id, choice: c }) });
    const out = await r.json();
    if (out.ok) window.location.href = out.redirect;
    else {
      setError(out.error);
      setBusy(false);
    }
  }
  return (
    <div className="mt-6 space-y-3">
      {mode === "setup" ? (
        <fieldset className="space-y-2">
          <legend className="text-[0.85rem] text-ink-soft">Choose a test card to save</legend>
          {SETUP_CARDS.map(([v, l]) => (
            <label key={v} className="flex items-center gap-3 rounded-2xl border border-line bg-card px-4 py-3 text-[0.9rem]">
              <input type="radio" name="card" value={v} checked={choice === v} onChange={() => setChoice(v)} />
              {l}
            </label>
          ))}
        </fieldset>
      ) : (
        <p className="rounded-2xl border border-line bg-card px-4 py-3 text-[0.9rem]">Test card ending 4242</p>
      )}
      <Button className="w-full" disabled={busy} onClick={() => go(choice)}>
        {mode === "setup" ? "Save card" : "Pay"}
      </Button>
      <Button variant="ghost" className="w-full" disabled={busy} onClick={() => go("decline")}>
        Try a declined card
      </Button>
      <a href={cancelUrl} className="block text-center text-[0.9rem] text-ink-soft underline underline-offset-4">Cancel and go back</a>
      {error && <p role="alert" className="text-[0.9rem] text-clay-deep">{error}</p>}
    </div>
  );
}
