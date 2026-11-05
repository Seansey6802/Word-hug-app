import { videoLink } from "@/lib/server/repo";
import { fail } from "@/lib/server/http";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ token: string }> };

/** Only once a recording really exists: redirect to a short-lived signed link. */
export async function GET(_req: Request, { params }: Ctx) {
  try {
    const url = await videoLink((await params).token);
    if (!url) return new Response("Not recorded yet", { status: 404, headers: { "Cache-Control": "no-store" } });
    return new Response(null, { status: 302, headers: { Location: url, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
  } catch (e) {
    return fail(e);
  }
}
