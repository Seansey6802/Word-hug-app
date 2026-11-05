import { deleteHug, ownerState, rerollHug } from "@/lib/server/repo";
import { fail, json, requireOwner } from "@/lib/server/http";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ token: string }> };

/** Owner view: video booking, waitlist, next available day, photo settings. */
export async function GET(req: Request, { params }: Ctx) {
  try {
    const hug = await requireOwner(req, (await params).token);
    return json(await ownerState(hug));
  } catch (e) {
    return fail(e);
  }
}

/** "Write me another": recompose with a fresh seed, avoiding lines just seen. */
export async function PATCH(req: Request, { params }: Ctx) {
  try {
    const hug = await requireOwner(req, (await params).token);
    const body = (await req.json().catch(() => ({}))) as { avoid?: unknown };
    const avoid = Array.isArray(body.avoid) ? body.avoid.map(String) : [];
    const c = await rerollHug(hug, avoid);
    return json({ content: { headline: c.headline, kicker: c.kicker, paragraphs: c.paragraphs }, lineIds: c.lineIds });
  } catch (e) {
    return fail(e);
  }
}

/** Permanently delete the hug, its photo, and any video. */
export async function DELETE(req: Request, { params }: Ctx) {
  try {
    const hug = await requireOwner(req, (await params).token);
    await deleteHug(hug);
    return json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
