import { isStudio } from "@/lib/server/studio";
import { studioFinalize } from "@/lib/server/repo";
import { fail, json } from "@/lib/server/http";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };

/** Marks ready only if the database can see the uploaded object in storage. */
export async function POST(req: Request, { params }: Ctx) {
  try {
    if (!(await isStudio())) return json({ error: "Studio sign-in required." }, 401);
    const { path } = (await req.json().catch(() => ({}))) as { path?: string };
    await studioFinalize((await params).id, String(path ?? ""));
    return json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
