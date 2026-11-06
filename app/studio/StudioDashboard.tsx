"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/Button";
import { formatDay } from "@/lib/dates";
import type { StudioDay, StudioOrder } from "@/lib/types";
import type { StudioSettingsView } from "@/lib/server/repo";

type Data = {
  orders: StudioOrder[];
  days: StudioDay[];
  settings: StudioSettingsView;
  waitlist: number;
};

const PAYMENT_LABEL: Record<string, [string, string]> = {
  method_saved: ["Card saved · not charged", "text-ink-soft"],
  authorized: ["$15 authorized · capture after upload", "text-ink"],
  captured: ["$15 captured", "text-sage"],
  action_required: ["Payment needs the customer — don’t record", "text-clay-deep"],
  capture_failed: ["Capture failed — retrying", "text-clay-deep"],
  refunded: ["Refunded", "text-ink-soft"],
  disputed: ["Disputed — video withheld", "text-clay-deep"],
  canceled: ["Authorization released", "text-ink-soft"],
};

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MAX_VIDEO_BYTES = 50 * 1024 * 1024;

/** Reads duration and height in the browser so the founder gets a warning before uploading. */
function probeVideo(file: File): Promise<{ duration: number; height: number } | null> {
  return new Promise((resolve) => {
    const v = document.createElement("video");
    const url = URL.createObjectURL(file);
    const done = (r: { duration: number; height: number } | null) => {
      URL.revokeObjectURL(url);
      resolve(r);
    };
    v.preload = "metadata";
    v.muted = true;
    v.onloadedmetadata = () => done({ duration: v.duration, height: v.videoHeight });
    v.onerror = () => done(null);
    setTimeout(() => done(null), 5000);
    v.src = url;
  });
}

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
  held: "bg-blush text-ink",
  booked: "bg-butter text-ink",
  recording: "bg-clay text-card",
  ready: "bg-sage text-card",
  expired: "bg-ink/10 text-ink-soft",
  canceled: "bg-ink/10 text-ink-soft",
};
const STATUS_LABEL: Record<StudioOrder["status"], string> = {
  held: "Held for waitlist",
  booked: "Booked",
  recording: "Recording",
  ready: "Uploaded · ready",
  expired: "Delivered · file removed",
  canceled: "Cancelled",
};

async function api(path: string, method: string, body?: unknown) {
  const res = await fetch(path, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out.error ?? "That didn’t work.");
  return out;
}

function OrderCard({ o, today, onChange }: { o: StudioOrder; today: string; onChange: () => void }) {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showScript, setShowScript] = useState(o.status === "recording");

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn’t work.");
    }
    setBusy(false);
    onChange();
  }

  // 1) ask for a one-time signed upload URL, 2) PUT straight to private storage,
  // 3) finalize — the database verifies the object really exists before "ready".
  async function upload(file: File | undefined) {
    if (!file) return;
    setError(null);
    if (file.size > MAX_VIDEO_BYTES) {
      setError(`That file is ${(file.size / 1048576).toFixed(0)} MB. The limit is 50 MB — record at 720p, 30–60 seconds.`);
      return;
    }
    const meta = await probeVideo(file);
    if (meta && (meta.duration > 75 || meta.duration < 15)) {
      const ok = confirm(`This video is ${Math.round(meta.duration)} seconds. The target is 30–60 seconds. Upload anyway?`);
      if (!ok) return;
    }
    if (meta && meta.height > 1080) {
      const ok = confirm(`This video is ${meta.height}p. 720p keeps files small and quick to load. Upload anyway?`);
      if (!ok) return;
    }
    try {
      const mime = file.type || "video/mp4";
      const { url, path } = await api(`/api/studio/orders/${o.id}/upload-url`, "POST", { mime });
      setProgress(0);
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", url);
        xhr.setRequestHeader("content-type", mime);
        xhr.setRequestHeader("x-upsert", "false");
        xhr.upload.onprogress = (e) => e.lengthComputable && setProgress(Math.round((e.loaded / e.total) * 100));
        xhr.onload = () => (xhr.status < 300 ? resolve() : reject(new Error(`Upload failed (${xhr.status}).`)));
        xhr.onerror = () => reject(new Error("Upload failed — check your connection."));
        xhr.send(file);
      });
      const fin = await api(`/api/studio/orders/${o.id}/finalize`, "POST", { path, durationSeconds: meta?.duration });
      if (!fin.released) setError("Uploaded and verified. The $15 couldn’t be captured, so the video stays hidden until the customer pays — they’ve been asked.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    }
    setProgress(null);
    onChange();
  }

  const h = o.hug;
  return (
    <li className="rounded-[1.4rem] border border-line bg-card p-5" data-order={o.id}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-display text-[1.35rem] leading-tight">
            For {h.recipientName || "(no name)"}
            {!h.forSelf && <span className="text-ink-faint"> · from {h.senderName || "anonymous"}</span>}
          </p>
          <p className="mt-0.5 text-[0.82rem] text-ink-faint">
            {h.kind} · {h.tone} · ordered {ago(o.createdAt)}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <span className={`rounded-full px-2.5 py-1 text-[0.7rem] font-medium uppercase tracking-[0.12em] ${STATUS_STYLE[o.status]}`}>{STATUS_LABEL[o.status]}</span>
          {o.demo && <span className="rounded-full border border-line px-2 py-0.5 text-[0.65rem] uppercase tracking-[0.12em] text-ink-faint">Demo data</span>}
        </div>
      </div>

      {o.paymentStatus !== "none" && PAYMENT_LABEL[o.paymentStatus] && (
        <p className={`mt-2 text-[0.8rem] font-medium ${PAYMENT_LABEL[o.paymentStatus][1]}`}>{PAYMENT_LABEL[o.paymentStatus][0]}</p>
      )}
      {o.status === "held" && o.holdExpiresAt && (
        <p className="mt-3 text-[0.85rem] text-ink-soft">
          Waiting for the customer to confirm by {new Date(o.holdExpiresAt).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" })}. Don’t record yet.
        </p>
      )}
      {(h.occasion || h.interests.length > 0) && (
        <p className="mt-3 text-[0.85rem] text-ink-soft">
          {h.occasion && <>Occasion: <b className="font-medium text-ink">{h.occasion}</b>. </>}
          {h.interests.length > 0 && <>Loves: <b className="font-medium text-ink">{h.interests.join(", ")}</b>.</>}
        </p>
      )}
      {o.note && <p className="mt-3 rounded-xl bg-butter/50 px-3 py-2 text-[0.9rem]">“{o.note}”</p>}

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

      <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-line pt-4">
        {o.status === "booked" && (
          <>
            <Button size="sm" onClick={() => run(() => api(`/api/studio/orders/${o.id}`, "PATCH", { status: "recording" }))} disabled={busy || o.recordingDay > today}>
              Start recording
            </Button>
            {o.recordingDay > today && <span className="text-[0.78rem] text-ink-faint">Booked for {formatDay(o.recordingDay, today)}</span>}
          </>
        )}
        {o.status === "recording" && (
          <>
            <label className={`inline-flex h-10 cursor-pointer items-center rounded-full bg-clay px-4 text-sm font-medium text-card ${progress !== null ? "pointer-events-none opacity-60" : ""}`}>
              {progress !== null ? `Uploading… ${progress}%` : "Upload recording"}
              <input type="file" accept="video/mp4,video/quicktime,video/webm,video/*" capture="user" className="hidden" onChange={(e) => upload(e.target.files?.[0])} />
            </label>
            <Button size="sm" variant="quiet" onClick={() => run(() => api(`/api/studio/orders/${o.id}`, "PATCH", { status: "booked" }))} disabled={busy}>
              Not now
            </Button>
          </>
        )}
        {o.status === "ready" && (
          <>
            <a href={`/api/studio/orders/${o.id}/video`} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center rounded-full border border-line px-4 text-sm">Watch upload</a>
            <a href={`/h/${h.token}`} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center rounded-full border border-line px-4 text-sm">Open hug</a>
            <Button size="sm" variant="quiet" onClick={() => confirm("Delete the uploaded video and re-record?") && run(() => api(`/api/studio/orders/${o.id}`, "PATCH", { status: "recording" }))} disabled={busy}>
              Re-record
            </Button>
            {o.paymentStatus === "captured" && (
              <Button
                size="sm"
                variant="quiet"
                disabled={busy}
                onClick={() => {
                  const r = prompt("Refund the full $15? (Test mode.) Reason:", "Goodwill refund");
                  if (r !== null) run(() => api(`/api/studio/orders/${o.id}/refund`, "POST", { reason: r }));
                }}
              >
                Refund
              </Button>
            )}
          </>
        )}
        {(o.status === "booked" || o.status === "recording" || o.status === "held") && (
          <Button
            size="sm"
            variant="quiet"
            disabled={busy}
            onClick={() => {
              const r = prompt("Why can’t you record this one? (The customer sees this. They won’t be charged.)", "We couldn’t record this one in time");
              if (r !== null) run(() => api(`/api/studio/orders/${o.id}`, "PATCH", { status: "canceled", reason: r }));
            }}
          >
            Can’t record
          </Button>
        )}
        {o.status === "canceled" && <p className="text-[0.85rem] text-ink-faint">{o.canceledReason} · payment {o.paymentStatus.replace("demo_", "demo ")}</p>}
      </div>
      {o.status === "recording" && (
        <p className="mt-2 text-[0.78rem] text-ink-faint">
          Target: 30–60 seconds, 720p (iPhone: Settings › Camera › Record Video › 720p HD), under 50 MB. The customer sees “ready” only after the upload is verified in storage.
        </p>
      )}
      {error && <p className="mt-2 text-[0.85rem] text-clay-deep">{error}</p>}
    </li>
  );
}

function DayRow({ d, today, onChange }: { d: StudioDay; today: string; onChange: () => void }) {
  const set = (capacity: number, closed: boolean) => api("/api/studio/days", "PATCH", { day: d.day, capacity, closed }).then(onChange, onChange);
  return (
    <li className="flex items-center justify-between gap-3 py-2.5">
      <div>
        <p className="text-[0.92rem] font-medium capitalize">{formatDay(d.day, today)}</p>
        <p className="text-[0.78rem] text-ink-faint">{d.closed ? "Closed" : `${d.used} of ${d.capacity} booked`}</p>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex items-center rounded-full border border-line">
          <button className="h-8 w-8" aria-label={`Fewer slots on ${d.day}`} onClick={() => set(d.capacity - 1, d.closed)}>−</button>
          <span className="w-6 text-center font-display">{d.capacity}</span>
          <button className="h-8 w-8" aria-label={`More slots on ${d.day}`} onClick={() => set(d.capacity + 1, d.closed)}>+</button>
        </div>
        <button onClick={() => set(d.capacity, !d.closed)} className="text-[0.8rem] text-ink-soft underline underline-offset-4">
          {d.closed ? "Reopen" : "Close"}
        </button>
      </div>
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
    if (res.ok) setData(await res.json());
  }, [router]);

  useEffect(() => {
    load();
    const id = setInterval(load, 20000);
    return () => clearInterval(id);
  }, [load]);

  async function signOut() {
    await fetch("/api/studio/session", { method: "DELETE" });
    router.refresh();
  }

  if (!data) return <p className="mt-16 text-center text-ink-faint">Opening the studio…</p>;
  const { settings, days } = data;
  const today = settings.today;
  const todayRow = days.find((d) => d.day === today);
  const active = data.orders.filter((o) => ["held", "booked", "recording"].includes(o.status));
  const toRecordToday = active.filter((o) => o.recordingDay <= today && o.status !== "held").length;
  const orders = data.orders.filter((o) => (tab === "active" ? ["held", "booked", "recording"].includes(o.status) : o.status === tab));
  const groups = [...new Set(orders.map((o) => o.recordingDay))];

  return (
    <div className="pt-4">
      <h1 className="font-display text-[2.2rem] leading-tight tracking-[-0.03em]">
        Good to see you. <span className="font-wonk">{toRecordToday} to record today.</span>
      </h1>

      <section className="mt-6 grid grid-cols-3 gap-2.5">
        {[
          ["Today", todayRow ? `${todayRow.used}/${todayRow.capacity}` : `0/${settings.defaultCapacity}`],
          ["Upcoming", String(active.length)],
          ["Waitlist", String(data.waitlist)],
        ].map(([k, v]) => (
          <div key={k} className="rounded-2xl border border-line bg-card px-4 py-3">
            <p className="text-[0.7rem] uppercase tracking-[0.16em] text-ink-faint">{k}</p>
            <p className="mt-1 font-display text-[1.6rem] leading-none">{v}</p>
          </div>
        ))}
      </section>

      <section className="mt-3 rounded-2xl border border-line bg-card px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="text-[0.88rem]">Default per recording day</span>
            <div className="flex items-center rounded-full border border-line">
              <button className="h-9 w-9 text-lg" aria-label="Decrease default capacity" onClick={() => api("/api/studio/settings", "PATCH", { defaultCapacity: settings.defaultCapacity - 1 }).then(load, load)}>−</button>
              <span className="w-8 text-center font-display text-lg">{settings.defaultCapacity}</span>
              <button className="h-9 w-9 text-lg" aria-label="Increase default capacity" onClick={() => api("/api/studio/settings", "PATCH", { defaultCapacity: settings.defaultCapacity + 1 }).then(load, load)}>+</button>
            </div>
          </div>
          <label className="flex items-center gap-2 text-[0.88rem]">
            <input type="checkbox" checked={settings.paused} onChange={(e) => api("/api/studio/settings", "PATCH", { paused: e.target.checked }).then(load, load)} className="h-5 w-5 accent-[var(--color-clay)]" />
            Pause new bookings
          </label>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-3 border-t border-line pt-3 text-[0.88rem]">
          <label className="flex items-center gap-2">
            Same-day cutoff
            <select
              value={settings.cutoffHour}
              onChange={(e) => api("/api/studio/settings", "PATCH", { cutoffHour: Number(e.target.value) }).then(load, load)}
              className="rounded-full border border-line bg-card px-3 py-1.5"
              aria-label="Same-day cutoff"
            >
              {Array.from({ length: 25 }, (_, h) => (
                <option key={h} value={h}>
                  {h === 0 ? "No same-day" : h === 24 ? "Midnight" : `${h % 12 || 12} ${h < 12 ? "a.m." : "p.m."}`}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2">
            Waitlist hold
            <select
              value={settings.holdHours}
              onChange={(e) => api("/api/studio/settings", "PATCH", { holdHours: Number(e.target.value) }).then(load, load)}
              className="rounded-full border border-line bg-card px-3 py-1.5"
              aria-label="Waitlist hold length"
            >
              {[2, 4, 8, 12, 24].map((h) => (
                <option key={h} value={h}>{h} hours</option>
              ))}
            </select>
          </label>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[0.82rem]" role="group" aria-label="Recording weekdays">
          <span className="mr-1 text-[0.88rem]">Recording days</span>
          {WEEKDAYS.map((w, k) => {
            const on = settings.weekdays.includes(k + 1);
            return (
              <button
                key={w}
                aria-pressed={on}
                onClick={() =>
                  api("/api/studio/settings", "PATCH", {
                    weekdays: on ? settings.weekdays.filter((d) => d !== k + 1) : [...settings.weekdays, k + 1],
                  }).then(load, load)
                }
                className={`rounded-full border px-2.5 py-1 ${on ? "border-ink bg-ink text-card" : "border-line text-ink-soft"}`}
              >
                {w}
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-[0.75rem] text-ink-faint">
          {settings.timezone.replace("_", " ")} · {settings.windowDays}-day booking window · delivered videos kept {settings.retentionDays} days
        </p>
        {days.length > 0 && (
          <details className="mt-3 border-t border-line pt-2">
            <summary className="cursor-pointer text-[0.85rem] text-ink-soft">Upcoming recording days</summary>
            <ul className="divide-y divide-line">
              {days.map((d) => (
                <DayRow key={d.day} d={d} today={today} onChange={load} />
              ))}
            </ul>
          </details>
        )}
      </section>

      <nav className="mt-8 flex gap-1 rounded-full border border-line bg-card/60 p-1">
        {TABS.map((t) => {
          const n = data.orders.filter((o) => (t.key === "active" ? ["held", "booked", "recording"].includes(o.status) : o.status === t.key)).length;
          return (
            <button key={t.key} onClick={() => setTab(t.key)} className={`flex-1 rounded-full py-2 text-[0.88rem] transition ${tab === t.key ? "bg-ink text-card" : "text-ink-soft"}`}>
              {t.label} <span className="opacity-60">{n}</span>
            </button>
          );
        })}
      </nav>

      {orders.length === 0 && <p className="mt-5 rounded-2xl border border-dashed border-ink/20 p-8 text-center text-ink-faint">Nothing here. Go hug someone.</p>}
      {groups.map((g) => (
        <section key={g} className="mt-6">
          <h2 className="mb-3 text-[0.75rem] font-medium uppercase tracking-[0.18em] text-ink-faint">{formatDay(g, today)}</h2>
          <ul className="space-y-4">
            {orders
              .filter((o) => o.recordingDay === g)
              .map((o) => (
                <OrderCard key={o.id} o={o} today={today} onChange={load} />
              ))}
          </ul>
        </section>
      ))}

      <p className="mt-10 text-center text-[0.8rem] text-ink-faint">
        Payments run in Stripe test mode: card saved at booking, $15 authorized when you start recording, captured after upload.{" "}
        <button onClick={signOut} className="underline underline-offset-4">Sign out</button>
      </p>
    </div>
  );
}
