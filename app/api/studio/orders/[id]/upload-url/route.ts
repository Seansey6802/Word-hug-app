import { isStudio } from "@/lib/server/studio";
import { studioUploadUrl } from "@/lib/server/repo";
import { fail, json } from "@/lib/server/http";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };

/** One-time signed upload URL: the video goes straight from the phone to private storage. */
export async function POST(req: Request, { params }: Ctx) {
  try {
    if (!(await isStudio())) return json({ error: "Studio sign-in required." }, 401);
    const { mime } = (await req.json().catch(() => ({}))) as { mime?: string };
    return json(await studioUploadUrl((await params).id, String(mime ?? "")));
  } catch (e) {
    return fail(e);
  }
}
