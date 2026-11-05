import { isStudio } from "@/lib/server/studio";
import { studioPhotoLink } from "@/lib/server/repo";
import { fail } from "@/lib/server/http";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };

/** Founder sees a photo only if the customer explicitly allowed it, and only while it's live. */
export async function GET(_req: Request, { params }: Ctx) {
  try {
    if (!(await isStudio())) return new Response("Unauthorized", { status: 401 });
    const url = await studioPhotoLink((await params).id);
    if (!url) return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
    return new Response(null, { status: 302, headers: { Location: url, "Cache-Control": "no-store" } });
  } catch (e) {
    return fail(e);
  }
}
