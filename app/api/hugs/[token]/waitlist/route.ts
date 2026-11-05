import { joinWaitlist, leaveWaitlist, ownerState } from "@/lib/server/repo";
import { fail, json, requireOwner } from "@/lib/server/http";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ token: string }> };

/** Free waitlist: no charge until the customer confirms a held slot. */
export async function POST(req: Request, { params }: Ctx) {
  try {
    const hug = await requireOwner(req, (await params).token);
    const body = (await req.json().catch(() => ({}))) as { note?: unknown };
    await joinWaitlist(hug.id, String(body.note ?? "").replace(/[<>]/g, "").trim());
    return json(await ownerState(hug));
  } catch (e) {
    return fail(e);
  }
}

export async function DELETE(req: Request, { params }: Ctx) {
  try {
    const hug = await requireOwner(req, (await params).token);
    await leaveWaitlist(hug.id);
    return json(await ownerState(hug));
  } catch (e) {
    return fail(e);
  }
}
