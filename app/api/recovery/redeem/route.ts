import { redeemRecoveryToken } from "@/lib/server/repo";
import { fail, json, limit } from "@/lib/server/http";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    await limit(req, "recovery-redeem", 20, 3600);
    const { token } = (await req.json().catch(() => ({}))) as { token?: unknown };
    return json({ hugs: await redeemRecoveryToken(String(token ?? "")) });
  } catch (e) {
    return fail(e);
  }
}
