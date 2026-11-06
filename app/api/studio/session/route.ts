import { endSession, exchangeForStudioSession } from "@/lib/server/studio";
import { fail, json, limit } from "@/lib/server/http";

export const runtime = "nodejs";

/** Exchange an AAL2 Supabase Auth token (founder email + password + TOTP) for a studio session. */
export async function POST(req: Request) {
  try {
    await limit(req, "studio-login", 10, 900); // 10 tries / 15 min / IP
    const { accessToken } = (await req.json().catch(() => ({}))) as { accessToken?: unknown };
    if (typeof accessToken !== "string" || accessToken.length < 20 || accessToken.length > 4096) {
      return json({ error: "Please sign in." }, 401);
    }
    const r = await exchangeForStudioSession(accessToken);
    if (!r.ok) return json({ error: r.error }, r.status);
    return json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}

export async function DELETE() {
  await endSession();
  return json({ ok: true });
}
