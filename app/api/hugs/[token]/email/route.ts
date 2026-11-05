import { attachEmail } from "@/lib/server/repo";
import { fail, json, limit, requireOwner } from "@/lib/server/http";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ token: string }> };

/** Owner adds a recovery email so they can get back to this hug from a new device. */
export async function POST(req: Request, { params }: Ctx) {
  try {
    await limit(req, "attach-email", 20, 3600);
    const hug = await requireOwner(req, (await params).token);
    const { email } = (await req.json().catch(() => ({}))) as { email?: unknown };
    await attachEmail(hug.id, String(email ?? ""));
    return json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
