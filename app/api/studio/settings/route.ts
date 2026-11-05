import { isStudio } from "@/lib/server/studio";
import { mutate } from "@/lib/server/store";
import { json } from "@/lib/server/http";

export const runtime = "nodejs";

export async function PATCH(req: Request) {
  if (!(await isStudio())) return json({ error: "Studio sign-in required." }, 401);
  const body = (await req.json().catch(() => ({}))) as { dailyCapacity?: unknown; paused?: unknown };
  const settings = await mutate((db) => {
    if (typeof body.dailyCapacity === "number" && Number.isFinite(body.dailyCapacity)) {
      db.settings.dailyCapacity = Math.max(0, Math.min(50, Math.round(body.dailyCapacity)));
    }
    if (typeof body.paused === "boolean") db.settings.paused = body.paused;
    return db.settings;
  });
  return json({ settings });
}
