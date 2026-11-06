"use client";

import { createClient } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Button } from "@/components/Button";

type Step = "password" | "enroll" | "verify";

const inputCls = "mt-3 w-full rounded-2xl border border-line bg-card px-4 py-3.5 focus:border-ink/40 focus:outline-none";

/**
 * Founder sign-in: email + password, then a 6-digit code from an authenticator
 * app (TOTP). First sign-in enrolls the authenticator. The Supabase session
 * lives only in memory and is exchanged once for a server-side studio session.
 */
export function StudioLogin() {
  const router = useRouter();
  const supabase = useMemo(
    () =>
      createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      }),
    [],
  );
  const [step, setStep] = useState<Step>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [factorId, setFactorId] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function exchange() {
    const { data } = await supabase.auth.getSession();
    const res = await fetch("/api/studio/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ accessToken: data.session?.access_token }),
    });
    await supabase.auth.signOut({ scope: "local" });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Studio access denied.");
    router.refresh();
  }

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { error: err } = await supabase.auth.signInWithPassword({ email, password });
      if (err) throw new Error("That email and password don’t match a studio account.");
      setPassword("");
      const { data: f } = await supabase.auth.mfa.listFactors();
      const totp = f?.totp?.find((x) => x.status === "verified");
      if (totp) {
        setFactorId(totp.id);
        setStep("verify");
      } else {
        // Clean up any half-finished enrollments, then start a fresh one.
        for (const x of f?.all ?? []) if (x.status !== "verified") await supabase.auth.mfa.unenroll({ factorId: x.id });
        const { data: en, error: enErr } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: `Word Hug studio ${Date.now()}` });
        if (enErr || !en) throw new Error("Couldn’t start two-step setup.");
        setFactorId(en.id);
        setQr(en.totp.qr_code);
        setSecret(en.totp.secret);
        setStep("enroll");
      }
    } catch (x) {
      setError(x instanceof Error ? x.message : "Sign-in failed.");
    }
    setBusy(false);
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    if (!factorId) return;
    setBusy(true);
    setError(null);
    try {
      const { error: err } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: code.trim() });
      if (err) throw new Error("That code didn’t work. Codes change every 30 seconds — try the current one.");
      await exchange();
    } catch (x) {
      setError(x instanceof Error ? x.message : "Verification failed.");
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto mt-16 max-w-sm">
      <h1 className="font-display text-[2.2rem] leading-tight tracking-[-0.03em]">
        The <span className="font-wonk">recording</span> studio.
      </h1>
      {step === "password" && (
        <form onSubmit={signIn}>
          <p className="mt-2 text-ink-soft">Founders only. Sign in with your own account.</p>
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" placeholder="Email" className={inputCls} />
          <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" placeholder="Password" className={inputCls} />
          <Button type="submit" disabled={busy || !email || !password} className="mt-4 w-full">{busy ? "Checking…" : "Continue"}</Button>
        </form>
      )}
      {step === "enroll" && (
        <form onSubmit={verify}>
          <p className="mt-2 text-ink-soft">Set up two-step verification. Scan this with an authenticator app (1Password, Google Authenticator, Authy), then enter the 6-digit code.</p>
          {qr && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qr} alt="Authenticator QR code" className="mx-auto mt-5 h-44 w-44 rounded-xl bg-white p-2" />
          )}
          {secret && <p className="mt-3 break-all text-center font-mono text-[0.75rem] text-ink-faint">Or enter: {secret}</p>}
          <input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" required value={code} onChange={(e) => setCode(e.target.value)} placeholder="123456" aria-label="Authenticator code" className={inputCls} />
          <Button type="submit" disabled={busy || code.length < 6} className="mt-4 w-full">{busy ? "Verifying…" : "Verify and enter"}</Button>
        </form>
      )}
      {step === "verify" && (
        <form onSubmit={verify}>
          <p className="mt-2 text-ink-soft">Enter the 6-digit code from your authenticator app.</p>
          <input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" required autoFocus value={code} onChange={(e) => setCode(e.target.value)} placeholder="123456" aria-label="Authenticator code" className={inputCls} />
          <Button type="submit" disabled={busy || code.length < 6} className="mt-4 w-full">{busy ? "Verifying…" : "Enter the studio"}</Button>
        </form>
      )}
      {error && <p role="alert" className="mt-3 text-[0.9rem] text-clay-deep">{error}</p>}
    </div>
  );
}
