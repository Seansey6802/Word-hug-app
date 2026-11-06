// Postgres access as the least-privilege `wordhug_app` role.
// In production DATABASE_URL points at Supabase's pooler (transaction mode).

import { Pool, type PoolClient, type QueryResultRow } from "pg";

type G = { __wordHugPool?: Pool };
const g = globalThis as unknown as G;

export function pool() {
  if (!g.__wordHugPool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set. See .env.example.");
    g.__wordHugPool = new Pool({
      connectionString: url,
      max: Number(process.env.DATABASE_POOL_MAX ?? 5),
      idleTimeoutMillis: 10_000,
      // Supabase requires TLS in production; local Docker does not use it.
      ssl: /localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: true },
    });
  }
  return g.__wordHugPool;
}

export async function q<T extends QueryResultRow = QueryResultRow>(text: string, params: unknown[] = []) {
  return (await pool().query<T>(text, params)).rows;
}

export async function one<T extends QueryResultRow = QueryResultRow>(text: string, params: unknown[] = []) {
  return (await q<T>(text, params))[0] ?? null;
}

export async function tx<T>(fn: (c: PoolClient) => Promise<T>) {
  const c = await pool().connect();
  try {
    await c.query("begin");
    const out = await fn(c);
    await c.query("commit");
    return out;
  } catch (e) {
    await c.query("rollback").catch(() => undefined);
    throw e;
  } finally {
    c.release();
  }
}

/** Maps the booking engine's SQLSTATEs (class WH) to stable app error codes. */
const WH: Record<string, string> = {
  WH001: "already_booked",
  WH002: "no_capacity",
  WH003: "paused",
  WH004: "bad_transition",
  WH005: "upload_missing",
  WH006: "not_found",
  WH007: "hold_expired",
  WH008: "already_waitlisted",
  WH009: "payment_not_authorized",
};

export class AppError extends Error {
  constructor(public code: string, message?: string) {
    super(message ?? code);
  }
}

export function dbCode(e: unknown): string | null {
  const code = (e as { code?: string })?.code;
  return code && WH[code] ? WH[code] : null;
}
