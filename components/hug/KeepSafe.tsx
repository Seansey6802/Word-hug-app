"use client";

import { useState } from "react";
import { Button } from "@/components/Button";

/** Optional recovery email, so a lost phone doesn't mean a lost hug. */
export function KeepSafe({ token, ownerKey, has, onSaved }: { token: string; ownerKey: string; has: boolean; onSaved: () => void }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const res = await fetch(`/api/hugs/${token}/email`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-owner-key": ownerKey },
      body: JSON.stringify({ email }),
    });
    const out = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setMsg(out.error ?? "That didn’t work.");
    setEmail("");
    setMsg("Saved. If you ever lose this phone, recover your hugs from “My hugs”.");
    onSaved();
  }

  return (
    <section className="rounded-[1.4rem] border border-line px-5 py-4 text-[0.9rem]">
      <p className="font-medium">Keep this hug safe</p>
      <p className="mt-1 text-ink-soft">
        {has
          ? "A recovery email is attached. You can get back to this hug from any device."
          : "Your controls for this hug live on this device. Add an email so you can recover them if you switch phones."}
      </p>
      {!has && (
        <form onSubmit={save} className="mt-3 flex gap-2">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            placeholder="you@example.com"
            aria-label="Recovery email"
            className="min-w-0 flex-1 rounded-full border border-line bg-card px-4 py-2.5 focus:border-ink/40 focus:outline-none"
          />
          <Button type="submit" size="sm" variant="ink" disabled={busy || !email}>
            {busy ? "Saving…" : "Save email"}
          </Button>
        </form>
      )}
      {msg && <p className="mt-2 text-[0.82rem] text-ink-soft">{msg}</p>}
      <p className="mt-2 text-[0.75rem] text-ink-faint">Used only for recovery links. Never for marketing.</p>
    </section>
  );
}
