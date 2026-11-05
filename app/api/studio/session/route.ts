import { checkPasscode, endSession, startSession } from "@/lib/server/studio";
import { json } from "@/lib/server/http";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const { passcode } = (await req.json().catch(() => ({}))) as { passcode?: string };
  await new Promise((r) => setTimeout(r, 400)); // gentle brute-force speed bump
  if (!passcode || !(await checkPasscode(String(passcode)))) return json({ error: "That's not the studio passcode." }, 401);
  await startSession();
  return json({ ok: true });
}

export async function DELETE() {
  await endSession();
  return json({ ok: true });
}
