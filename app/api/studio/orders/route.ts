import { isStudio } from "@/lib/server/studio";
import { studioOverview } from "@/lib/server/repo";
import { fail, json } from "@/lib/server/http";

export const runtime = "nodejs";

export async function GET() {
  try {
    if (!(await isStudio())) return json({ error: "Studio sign-in required." }, 401);
    return json(await studioOverview());
  } catch (e) {
    return fail(e);
  }
}
