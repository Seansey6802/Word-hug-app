import { safeEqual } from "@/lib/server/ids";
import { runMaintenance } from "@/lib/server/repo";
import { fail, json } from "@/lib/server/http";

export const runtime = "nodejs";

/**
 * Deletes expired photos, sweeps orphaned media, releases expired holds.
 * Call hourly (e.g. Vercel Cron) with `Authorization: Bearer $CRON_SECRET`.
 * Expired photos are already invisible before this runs (enforced by RLS).
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const got = (req.headers.get("authorization") ?? "").replace(/^Bearer /, "");
  if (!secret || !safeEqual(got, secret)) return json({ error: "Unauthorized" }, 401);
  try {
    return json(await runMaintenance());
  } catch (e) {
    return fail(e);
  }
}
