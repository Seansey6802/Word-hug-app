import { checkPasscode, endSession, startSession } from "@/lib/server/studio";
import { fail, json, limit } from "@/lib/server/http";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    await limit(req, "studio-login", 10, 900); // 10 tries / 15 min / IP
    const { passcode } = (await req.json().catch(() => ({}))) as { passcode?: string };
    await new Promise((r) => setTimeout(r, 300));
    if (!passcode || !checkPasscode(String(passcode))) return json({ error: "That's not the studio passcode." }, 401);
    await startSession();
    return json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}

export async function DELETE() {
  await endSession();
  return json({ ok: true });
}
