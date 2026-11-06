import { isStudio } from "@/lib/server/studio";
import { studioCancel, studioSetRecording } from "@/lib/server/repo";
import { authorizeForRecording, releaseAuthorization } from "@/lib/payments/service";
import { fail, json } from "@/lib/server/http";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };

// "ready" is deliberately not accepted here: the only path to ready is
// uploading a recording and finalizing it (see ./finalize).
export async function PATCH(req: Request, { params }: Ctx) {
  try {
    if (!(await isStudio())) return json({ error: "Studio sign-in required." }, 401);
    const { id } = await params;
    const { status, reason } = (await req.json().catch(() => ({}))) as { status?: string; reason?: string };
    if (status === "recording") {
      // The $15 must be authorized before the founder spends time recording.
      const auth = await authorizeForRecording(id);
      if (!auth.ok) {
        return json({ error: `The customer's card couldn't be authorized (${auth.code}). Don't record yet — they've been asked to update their payment.`, code: "payment_action_required" }, 402);
      }
      await studioSetRecording(id, true);
    } else if (status === "booked") await studioSetRecording(id, false);
    else if (status === "canceled") {
      await studioCancel(id, String(reason ?? "The studio couldn't record this one"));
      await releaseAuthorization(id);
    } else return json({ error: `Status "${status}" can't be set directly.` }, 409);
    return json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
