import { isStudio } from "@/lib/server/studio";
import { deleteFile, mutate, putFile } from "@/lib/server/store";
import { json } from "@/lib/server/http";
import { newToken } from "@/lib/server/ids";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };

const TYPES: Record<string, string> = { "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm" };
const MAX = 200 * 1024 * 1024;

/** The one and only path to "ready": an actual recorded file, uploaded and stored. */
export async function POST(req: Request, { params }: Ctx) {
  if (!(await isStudio())) return json({ error: "Studio sign-in required." }, 401);
  const { id } = await params;
  const form = await req.formData().catch(() => null);
  const file = form?.get("video");
  if (!(file instanceof File) || file.size === 0) return json({ error: "Choose a video file to upload." }, 400);
  if (!TYPES[file.type]) return json({ error: "Videos must be MP4, MOV or WebM." }, 400);
  if (file.size > MAX) return json({ error: "That video is over 200 MB." }, 400);
  if (file.size < 10 * 1024) return json({ error: "That file is too small to be a real recording." }, 400);

  const key = `${newToken()}.${TYPES[file.type]}`;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const out = await mutate(async (db) => {
    const v = db.videos.find((x) => x.id === id);
    if (!v) return { error: "Order not found.", code: 404 };
    if (v.status !== "recording") return { error: "Mark the order as recording before uploading.", code: 409 };
    await putFile(key, bytes); // write first; only then flip the status
    await deleteFile(v.video?.file);
    const now = new Date().toISOString();
    v.video = { file: key, mime: file.type, bytes: bytes.byteLength, uploadedAt: now };
    v.status = "ready";
    v.history.push({ status: "ready", at: now });
    return { ok: true };
  });
  if ("error" in out) return json({ error: out.error }, out.code);
  return json(out);
}
