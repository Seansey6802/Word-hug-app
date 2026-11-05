import { getHugByToken, openFile, read } from "@/lib/server/store";
import { activeVideoFor } from "@/lib/server/hugs";
import { streamFile } from "@/lib/server/http";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ token: string }> };

/** Serves the recorded video to anyone holding the private gift link — only once it truly exists. */
export async function GET(req: Request, { params }: Ctx) {
  const { token } = await params;
  const hug = await getHugByToken(token);
  if (!hug) return new Response("Not found", { status: 404 });
  const v = await read((db) => activeVideoFor(db, hug.id));
  if (!v || v.status !== "ready" || !v.video) return new Response("Not recorded yet", { status: 404 });
  const file = v.video;
  return streamFile(req, () => openFile(file.file), file.bytes, file.mime);
}
