import { deletePhoto, photoLink } from "@/lib/server/repo";
import { fail, json, requireOwner } from "@/lib/server/http";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ token: string }> };

/** Holders of the private gift link get a short-lived signed link to the photo. */
export async function GET(_req: Request, { params }: Ctx) {
  try {
    const url = await photoLink((await params).token);
    if (!url) return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
    return new Response(null, { status: 302, headers: { Location: url, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
  } catch (e) {
    return fail(e);
  }
}

export async function DELETE(req: Request, { params }: Ctx) {
  try {
    const hug = await requireOwner(req, (await params).token);
    await deletePhoto(hug.id);
    return json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
