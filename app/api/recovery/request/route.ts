import { createRecoveryToken } from "@/lib/server/repo";
import { sendMail } from "@/lib/server/mail";
import { fail, json, limit } from "@/lib/server/http";

export const runtime = "nodejs";

/** Always answers the same way, so it can't be used to learn who has hugs. */
export async function POST(req: Request) {
  try {
    await limit(req, "recovery", 5, 3600);
    const { email } = (await req.json().catch(() => ({}))) as { email?: unknown };
    const e = String(email ?? "").trim().toLowerCase();
    if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e) && e.length <= 254) {
      const token = await createRecoveryToken(e);
      if (token) {
        const link = `${process.env.APP_URL ?? "http://localhost:3000"}/recover#t=${token}`;
        await sendMail(
          e,
          "Your Word Hugs, back in your hands",
          `Someone (hopefully you) asked to recover their Word Hugs.\n\nOpen this link within 30 minutes on the device you want to use:\n${link}\n\nIt works once. If you didn't ask for this, you can ignore this email.\n\n— Word Hug`,
        );
      }
    }
    return json({ ok: true, message: "If that email has hugs, a recovery link is on its way." });
  } catch (e) {
    return fail(e);
  }
}
