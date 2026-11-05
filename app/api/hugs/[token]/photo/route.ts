import { deleteFile, getHugByToken, mutate, openFile } from "@/lib/server/store";
import { json, ownerHug, streamFile } from "@/lib/server/http";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ token: string }> };

/** The private gift link is the capability: only holders of the link see the photo. */
export async function GET(req: Request, { params }: Ctx) {
  const { token } = await params;
  const hug = await getHugByToken(token);
  if (!hug?.photo) return new Response("Not found", { status: 404 });
  const photo = hug.photo;
  return streamFile(req, () => openFile(photo.file), photo.bytes, photo.mime);
}

export async function DELETE(req: Request, { params }: Ctx) {
  const { token } = await params;
  const r = await ownerHug(req, token);
  if ("error" in r) return r.error;
  await mutate(async (db) => {
    const h = db.hugs.find((x) => x.id === r.hug.id);
    if (h?.photo) {
      await deleteFile(h.photo.file);
      delete h.photo;
    }
  });
  return json({ ok: true });
}
