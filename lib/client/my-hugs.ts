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
