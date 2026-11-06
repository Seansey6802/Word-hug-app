import { isStudio } from "@/lib/server/studio";
import { studioFinalize } from "@/lib/server/repo";
import { captureAfterUpload } from "@/lib/payments/service";
import { fail, json } from "@/lib/server/http";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };

/** Marks ready only if the uploaded object exists; then captures the $15. Viewers see it only after capture. */
export async function POST(req: Request, { params }: Ctx) {
  try {
    if (!(await isStudio())) return json({ error: "Studio sign-in required." }, 401);
    const { id } = await params;
    const { path, durationSeconds } = (await req.json().catch(() => ({}))) as { path?: string; durationSeconds?: number };
    await studioFinalize(id, String(path ?? ""), typeof durationSeconds === "number" ? durationSeconds : undefined);
    const cap = await captureAfterUpload(id);
    return json({ ok: true, released: cap.released, reason: cap.released ? undefined : cap.reason });
  } catch (e) {
    return fail(e);
  }
}
