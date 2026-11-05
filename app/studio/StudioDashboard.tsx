"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/Button";
import type { StudioOrder } from "@/lib/types";

type Data = {
  orders: StudioOrder[];
  capacity: { capacity: number; usedToday: number; remaining: number; open: number; paused: boolean };
  settings: { dailyCapacity: number; paused: boolean };
};

const TABS = [
  { key: "active", label: "To record" },
  { key: "ready", label: "Delivered" },
  { key: "canceled", label: "Cancelled" },
] as const;

function ago(iso: string) {
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
}

const STATUS_STYLE: Record<StudioOrder["status"], string> = {
  queued: "bg-butter text-ink",
  recording: "bg-clay text-card",
  ready: "bg-sage text-card",
  canceled: "bg-ink/10 text-ink-soft",
};
const STATUS_LABEL: Record<StudioOrder["status"], string> = {
  queued: "Queued",
  recording: "Recording",
  ready: "Uploaded · ready",
  canceled: "Cancelled",
};

function OrderCard({ o, onChange }: { o: StudioOrder; onChange: () => void }) {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showScript, setShowScript] = useState(o.status === "recording");

  async function move(status: string, reason?: string) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/studio/orders/${o.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status, reason }),
    });
    setBusy(false);
    if (!res.ok) setError((await res.json().catch(() => ({}))).error ?? "That didn’t work.");
    onChange();
  }

  function upload(file: File | undefined) {
    if (!file) return;
    setError(null);
    setProgress(0);
    const fd = new FormData();
    fd.set("video", file);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/studio/orders/${o.id}/upload`);
    xhr.upload.onprogress = (e) => e.lengthComputable && setProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      setProgress(null);
      if (xhr.status >= 300) {
        try {
          setError(JSON.parse(xhr.responseText).error);
        } catch {
          setError("Upload failed.");
        }
      }
      onChange();
    };
    xhr.onerror = () => {
      setProgress(null);
      setError("Upload failed — check your connection.");
    };
    xhr.send(fd);
  }

  const h = o.hug;
  return (
    <li className="rounded-[1.4rem] border border-line bg-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-display text-[1.35rem] leading-tight">
            For {h?.recipientName || "(no name)"}
            {h && !h.forSelf && <span className="text-ink-faint"> · from {h.senderName || "anonymous"}</span>}
          </p>
          <p className="mt-0.5 text-[0.82rem] text-ink-faint">
            {h?.kind} · {h?.tone} · ordered {ago(o.createdAt)}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <span className={`rounded-full px-2.5 py-1 text-[0.7rem] font-medium uppercase tracking-[0.12em] ${STATUS_STYLE[o.status]}`}>{STATUS_LABEL[o.status]}</span>
          {o.demo && <span className="rounded-full border border-line px-2 py-0.5 text-[0.65rem] uppercase tracking-[0.12em] text-ink-faint">Demo data</span>}
        </div>
      </div>

      {(h?.occasion || h?.interests.length) && (
        <p className="mt-3 text-[0.85rem] text-ink-soft">
          {h?.occasion && <>Occasion: <b className="font-medium text-ink">{h.occasion}</b>. </>}
          {h?.interests.length ? <>Loves: <b className="font-medium text-ink">{h.interests.join(", ")}</b>.</> : null}
        </p>
      )}
      {o.note && <p className="mt-3 rounded-xl bg-butter/50 px-3 py-2 text-[0.9rem]">“{o.note}”</p>}

      {h && (
        <div className="mt-3">
          <button onClick={() => setShowScript((s) => !s)} className="text-[0.85rem] font-medium text-clay">
            {showScript ? "Hide script" : "Show script"}
          </button>
          {showScript && (
            <div className="mt-3 space-y-3 rounded-2xl bg-paper p-4 font-display text-[1.12rem] leading-snug">
              <p className="text-[1.25rem]">{h.headline}</p>
              {h.paragraphs.map((p, k) => (
                <p key={k}>{p}</p>
              ))}
              {h.senderName && <p className="font-wonk text-ink-soft">— with love, {h.senderName}</p>}
            </div>
          )}
          {h.photoForVideo && (
            <div className="mt-3">
              <p className="text-[0.78rem] text-ink-faint">Photo shared for reference (customer allowed it):</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/studio/orders/${o.id}/photo`} alt="Customer reference photo" className="mt-1.5 h-24 w-24 rounded-xl object-cover" />
            </div>
          )}
        </div>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-line pt-4">
        {o.status === "queued" && (
          <>
            <Button size="sm" onClick={() => move("recording")} disabled={busy}>Start recording</Button>
            <Button
              size="sm"
              variant="quiet"
              disabled={busy}
              onClick={() => {
                const r = prompt("Why can’t you record this one? (The customer sees this. They won’t be charged.)", "We couldn’t record this one in time");
                if (r !== null) move("canceled", r);
              }}
            >
              Can’t record
            </Button>
          </>
        )}
        {o.status === "recording" && (
          <>
            <label className={`inline-flex h-10 cursor-pointer items-center rounded-full bg-clay px-4 text-sm font-medium text-card ${progress !== null ? "pointer-events-none opacity-60" : ""}`}>
              {progress !== null ? `Uploading… ${progress}%` : "Upload recording"}
              <input type="file" accept="video/mp4,video/quicktime,video/webm,video/*" capture="user" className="hidden" onChange={(e) => upload(e.target.files?.[0])} />
            </label>
            <Button size="sm" variant="quiet" onClick={() => move("queued")} disabled={busy}>Back to queue</Button>
          </>
        )}
        {o.status === "ready" && h && (
          <>
            <a href={`/api/hugs/${h.token}/video/file`} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center rounded-full border border-line px-4 text-sm">Watch upload</a>
            <a href={`/h/${h.token}`} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center rounded-full border border-line px-4 text-sm">Open hug</a>
            <Button size="sm" variant="quiet" onClick={() => confirm("Remove the uploaded video and re-record?") && move("recording")} disabled={busy}>Re-record</Button>
          </>
        )}
        {o.status === "canceled" && <p className="text-[0.85rem] text-ink-faint">{o.canceledReason} · payment {o.paymentStatus.replace("demo_", "demo ")}</p>}
      </div>
      {o.status === "recording" && <p className="mt-2 text-[0.78rem] text-ink-faint">The customer sees “ready” only after this upload finishes.</p>}
      {error && <p className="mt-2 text-[0.85rem] text-clay-deep">{error}</p>}
    </li>
  );
}

export function StudioDashboard() {
  const router = useRouter();
  const [data, setData] = useState<Data | null>(null);
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("active");

  const load = useCallback(async () => {
    const res = await fetch("/api/studio/orders");
    if (res.status === 401) return router.refresh();
    setData(await res.json());
  }, [router]);

  useEffect(() => {
    load();
    const id = setInterval(load, 20000);
    return () => clearInterval(id);
  }, [load]);

  async function setSettings(s: Partial<Data["settings"]>) {
    await fetch("/api/studio/settings", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(s) });
    load();
  }

  async function signOut() {
    await fetch("/api/studio/session", { method: "DELETE" });
    router.refresh();
  }

  if (!data) return <p className="mt-16 text-center text-ink-faint">Opening the studio…</p>;
  const { capacity: c, settings } = data;
  const orders = data.orders.filter((o) =>
    tab === "active" ? o.status === "queued" || o.status === "recording" : o.status === tab,
  );

  return (
    <div className="pt-4">
      <h1 className="font-display text-[2.2rem] leading-tight tracking-[-0.03em]">
        Good to see you. <span className="font-wonk">{c.open} to record.</span>
      </h1>

      <section className="mt-6 grid grid-cols-3 gap-2.5">
        {[
          ["Today", `${c.usedToday}/${c.capacity}`],
          ["Slots left", c.paused ? "Paused" : String(c.remaining)],
          ["Open queue", String(c.open)],
        ].map(([k, v]) => (
          <div key={k} className="rounded-2xl border border-line bg-card px-4 py-3">
            <p className="text-[0.7rem] uppercase tracking-[0.16em] text-ink-faint">{k}</p>
            <p className="mt-1 font-display text-[1.6rem] leading-none">{v}</p>
          </div>
        ))}
      </section>

      <section className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-card px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="text-[0.88rem]">Daily capacity</span>
          <div className="flex items-center rounded-full border border-line">
            <button className="h-9 w-9 text-lg" aria-label="Decrease capacity" onClick={() => setSettings({ dailyCapacity: settings.dailyCapacity - 1 })}>−</button>
            <span className="w-8 text-center font-display text-lg">{settings.dailyCapacity}</span>
            <button className="h-9 w-9 text-lg" aria-label="Increase capacity" onClick={() => setSettings({ dailyCapacity: settings.dailyCapacity + 1 })}>+</button>
          </div>
        </div>
        <label className="flex items-center gap-2 text-[0.88rem]">
          <input type="checkbox" checked={settings.paused} onChange={(e) => setSettings({ paused: e.target.checked })} className="h-5 w-5 accent-[var(--color-clay)]" />
          Pause new orders
        </label>
      </section>

      <nav className="mt-8 flex gap-1 rounded-full border border-line bg-card/60 p-1">
        {TABS.map((t) => {
          const n = data.orders.filter((o) => (t.key === "active" ? o.status === "queued" || o.status === "recording" : o.status === t.key)).length;
          return (
            <button key={t.key} onClick={() => setTab(t.key)} className={`flex-1 rounded-full py-2 text-[0.88rem] transition ${tab === t.key ? "bg-ink text-card" : "text-ink-soft"}`}>
              {t.label} <span className="opacity-60">{n}</span>
            </button>
          );
        })}
      </nav>

      <ul className="mt-5 space-y-4">
        {orders.length === 0 && <li className="rounded-2xl border border-dashed border-ink/20 p-8 text-center text-ink-faint">Nothing here. Go hug someone.</li>}
        {orders.map((o) => (
          <OrderCard key={o.id} o={o} onChange={load} />
        ))}
      </ul>

      <p className="mt-10 text-center text-[0.8rem] text-ink-faint">
        Orders are first in, first out. Payments are demo-only: authorized on order, released if cancelled.{" "}
        <button onClick={signOut} className="underline underline-offset-4">Sign out</button>
      </p>
    </div>
  );
}
