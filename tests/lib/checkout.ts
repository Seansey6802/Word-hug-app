// Drives the checkout flows through the running app with the FAKE gateway
// (PAYMENTS_MODE=fake). The same app code runs against Stripe test mode.
import { readFileSync } from "node:fs";

export const BASE = process.env.TEST_BASE_URL ?? "http://localhost:3000";
export const ip = () => `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
const JPEG = readFileSync(new URL("../../public/photos/gift-held-out.jpg", import.meta.url));

export const sessionFrom = (url: string) => url.split("/dev/checkout/")[1];

export async function fakePay(sessionId: string, choice = "pay") {
  const r = await fetch(`${BASE}/api/dev/checkout`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sessionId, choice }) });
  return { status: r.status, body: await r.json() };
}
export const settle = () => fetch(`${BASE}/api/dev/fake`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "settle" }) });
export const fakeAction = (body: Record<string, unknown>) =>
  fetch(`${BASE}/api/dev/fake`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());

export async function startHug(opts: { photo?: boolean; consent?: boolean; forVideo?: boolean; bytes?: Uint8Array; type?: string } = {}) {
  const fd = new FormData();
  fd.set("data", JSON.stringify({ forSelf: false, category: "roast", tone: "deadpan", intensity: 2, recipientName: "Maya", senderName: "Jess", photoConsent: opts.consent ?? true, photoForVideo: opts.forVideo ?? false }));
  if (opts.photo) fd.set("photo", new Blob([(opts.bytes ?? new Uint8Array(JPEG)) as BlobPart], { type: opts.type ?? "image/jpeg" }), "p.jpg");
  const r = await fetch(`${BASE}/api/hugs`, { method: "POST", body: fd, headers: { "x-forwarded-for": ip() } });
  return { status: r.status, body: await r.json() };
}

export const confirmCheckout = async (sessionId: string) =>
  (await fetch(`${BASE}/api/checkout/confirm`, { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": ip() }, body: JSON.stringify({ sessionId }) })).json();

/** Full prepaid flow: draft → pay $1 → confirmed hug. Returns { token, ownerKey }. */
export async function buyHug(opts: Parameters<typeof startHug>[0] = {}) {
  const s = await startHug(opts);
  if (s.status !== 200) return { status: s.status, body: s.body };
  const sid = sessionFrom(s.body.checkoutUrl);
  await fakePay(sid, "pay");
  const c = await confirmCheckout(sid);
  return { status: 200, body: { token: c.token as string, ownerKey: s.body.ownerKey as string, sessionId: sid, draftId: s.body.draftId as string } };
}

export const owner = (token: string, key: string, path = "", init: RequestInit = {}) =>
  fetch(`${BASE}/api/hugs/${token}${path}`, { ...init, redirect: "manual", headers: { "x-owner-key": key, "content-type": "application/json", ...(init.headers ?? {}) } });

/** Book a video: hold → save a (fake) card → confirmed booking. */
export async function bookVideo(h: { token: string; ownerKey: string }, card = "pm_fake_ok", note = "") {
  const r = await owner(h.token, h.ownerKey, "/video", { method: "POST", body: JSON.stringify({ note }) });
  const body = await r.json();
  if (r.status !== 200) return { status: r.status, body };
  const sid = sessionFrom(body.checkoutUrl);
  await fakePay(sid, card);
  const c = await (await owner(h.token, h.ownerKey, "/video", { method: "POST", body: JSON.stringify({ confirm: sid }) })).json();
  return { status: 200, body: c, sessionId: sid };
}
