// Prototype storage. Everything lives in ./.data (git-ignored) on the machine
// running the dev server. The interface mirrors supabase/migrations so the
// Supabase adapter can replace it without touching routes or pages.

import { promises as fs } from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import type { Hug, StudioSettings, VideoOrder } from "../types";
import { seedDemoData } from "./demo-data";

const DATA_DIR = path.join(process.cwd(), ".data");
const DB_FILE = path.join(DATA_DIR, "db.json");
const FILES_DIR = path.join(DATA_DIR, "private");

type DB = {
  version: 1;
  secret: string; // signs studio sessions
  hugs: Hug[];
  videos: VideoOrder[];
  settings: StudioSettings;
};

// Next bundles routes and pages separately, so module state isn't shared.
// Keep one cache + write queue per process on globalThis, and re-read the
// file whenever it changed on disk.
type Shared = { cache: DB | null; mtime: number; queue: Promise<unknown> };
const g = globalThis as unknown as { __wordHugStore?: Shared };
const shared: Shared = (g.__wordHugStore ??= { cache: null, mtime: 0, queue: Promise.resolve() });

async function load(): Promise<DB> {
  const mtime = await fs.stat(DB_FILE).then((s) => s.mtimeMs, () => 0);
  if (shared.cache && mtime === shared.mtime) return shared.cache;
  if (mtime) {
    // Never silently reseed over an existing file; a parse error should surface.
    shared.cache = JSON.parse(await fs.readFile(DB_FILE, "utf8")) as DB;
    shared.mtime = mtime;
    return shared.cache;
  }
  {
    const cache: DB = {
      version: 1,
      secret: randomBytes(32).toString("hex"),
      hugs: [],
      videos: [],
      settings: { dailyCapacity: 8, paused: false },
    };
    seedDemoData(cache);
    await persist(cache);
    return cache;
  }
}

async function persist(db: DB) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const tmp = `${DB_FILE}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(db, null, 2));
  await fs.rename(tmp, DB_FILE);
  shared.cache = db;
  shared.mtime = (await fs.stat(DB_FILE)).mtimeMs;
}

/** Serialised read-modify-write so concurrent requests don't clobber each other. */
export function mutate<T>(fn: (db: DB) => T | Promise<T>): Promise<T> {
  const run = shared.queue.then(async () => {
    const db = await load();
    const out = await fn(db);
    await persist(db);
    return out;
  });
  shared.queue = run.catch(() => undefined);
  return run;
}

export async function read<T>(fn: (db: DB) => T): Promise<T> {
  await shared.queue;
  return fn(await load());
}

// ---------- private files (photos, videos) ----------

function filePath(key: string) {
  if (!/^[A-Za-z0-9_-]+\.(jpg|png|webp|mp4|mov|webm)$/.test(key)) throw new Error("bad file key");
  return path.join(FILES_DIR, key);
}

export async function putFile(key: string, data: Uint8Array) {
  await fs.mkdir(FILES_DIR, { recursive: true });
  await fs.writeFile(filePath(key), data);
}

export async function getFile(key: string) {
  return fs.readFile(filePath(key));
}

export async function statFile(key: string) {
  return fs.stat(filePath(key));
}

export async function openFile(key: string) {
  return fs.open(filePath(key), "r");
}

export async function deleteFile(key: string | undefined) {
  if (!key) return;
  await fs.rm(filePath(key), { force: true });
}

// ---------- helpers ----------

/** Photos expire automatically. Called lazily whenever a hug is read. */
export async function purgeExpiredPhotos() {
  const now = Date.now();
  const expired = await read((db) =>
    db.hugs.filter((h) => h.photo && Date.parse(h.photo.expiresAt) < now).map((h) => h.id),
  );
  if (!expired.length) return;
  await mutate(async (db) => {
    for (const h of db.hugs) {
      if (expired.includes(h.id) && h.photo) {
        await deleteFile(h.photo.file);
        delete h.photo;
      }
    }
  });
}

export async function getHugByToken(token: string) {
  if (!/^[A-Za-z0-9_-]{10,40}$/.test(token)) return null;
  await purgeExpiredPhotos();
  return read((db) => db.hugs.find((h) => h.token === token) ?? null);
}

export async function getSecret() {
  return read((db) => db.secret);
}

export type { DB };
