import { isStudio } from "@/lib/server/studio";
import { studioSetDay } from "@/lib/server/repo";
import { fail, json } from "@/lib/server/http";

export const runtime = "nodejs";

/** Per-day capacity or closing a day (e.g. the founder is away). */
export async function PATCH(req: Request) {
  try {
    if (!(await isStudio())) return json({ error: "Studio sign-in required." }, 401);
    const { day, capacity, closed } = (await req.json().catch(() => ({}))) as { day?: string; capacity?: number; closed?: boolean };
    await studioSetDay(String(day ?? ""), Number(capacity ?? 0), Boolean(closed));
    return json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
