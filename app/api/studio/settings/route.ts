import { isStudio } from "@/lib/server/studio";
import { studioSettings } from "@/lib/server/repo";
import { fail, json } from "@/lib/server/http";

export const runtime = "nodejs";

export async function PATCH(req: Request) {
  try {
    if (!(await isStudio())) return json({ error: "Studio sign-in required." }, 401);
    const body = (await req.json().catch(() => ({}))) as { defaultCapacity?: unknown; paused?: unknown };
    await studioSettings({
      defaultCapacity: typeof body.defaultCapacity === "number" ? body.defaultCapacity : undefined,
      paused: typeof body.paused === "boolean" ? body.paused : undefined,
    });
    return json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
