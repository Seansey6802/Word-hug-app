"use client";
// Owner keys live only on this device (localStorage), never in a shareable URL.

export type SavedHug = {
  token: string;
  ownerKey?: string;
  headline: string;
  createdAt: string;
  forSelf: boolean;
  recipientName: string;
  received?: boolean;
};

const KEY = "wh:hugs:v1";
const SEEN = "wh:seen:v1";

function safeGet<T>(k: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(k);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function safeSet(k: string, v: unknown) {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* private mode — fine */
  }
}

export const listHugs = () => safeGet<SavedHug[]>(KEY, []);

export function saveHug(h: SavedHug) {
  const all = listHugs().filter((x) => x.token !== h.token);
  const prev = listHugs().find((x) => x.token === h.token);
  safeSet(KEY, [{ ...prev, ...h, ownerKey: h.ownerKey ?? prev?.ownerKey }, ...all].slice(0, 100));
}

export function forgetHug(token: string) {
  safeSet(KEY, listHugs().filter((x) => x.token !== token));
}

export const ownerKeyFor = (token: string) => listHugs().find((x) => x.token === token)?.ownerKey;

export const seenLines = () => safeGet<string[]>(SEEN, []);
export function markSeen(ids: string[]) {
  safeSet(SEEN, [...ids, ...seenLines().filter((x) => !ids.includes(x))].slice(0, 60));
}

const PENDING = "wh:pending:v1";
type Pending = { ownerKey: string; recipientName: string; forSelf: boolean; at: number };

/** Owner key held on the device while the customer is at checkout. */
export function savePending(draftId: string, p: Omit<Pending, "at">) {
  const all = safeGet<Record<string, Pending>>(PENDING, {});
  for (const [k, v] of Object.entries(all)) if (Date.now() - v.at > 86400_000) delete all[k];
  all[draftId] = { ...p, at: Date.now() };
  safeSet(PENDING, all);
}

export function takePending(draftId: string): Pending | null {
  const all = safeGet<Record<string, Pending>>(PENDING, {});
  const p = all[draftId] ?? null;
  if (p) {
    delete all[draftId];
    safeSet(PENDING, all);
  }
  return p;
}
