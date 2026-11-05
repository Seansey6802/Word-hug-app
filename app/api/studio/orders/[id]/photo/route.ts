import { isStudio } from "@/lib/server/studio";
import { openFile, read } from "@/lib/server/store";
import { streamFile } from "@/lib/server/http";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };

/** Only shown to the studio if the customer explicitly allowed it. */
export async function GET(req: Request, { params }: Ctx) {
  if (!(await isStudio())) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  const photo = await read((db) => {
    const v = db.videos.find((x) => x.id === id);
    const h = v && db.hugs.find((x) => x.id === v.hugId);
    return h?.photo?.allowForVideo ? h.photo : null;
  });
  if (!photo) return new Response("Not found", { status: 404 });
  return streamFile(req, () => openFile(photo.file), photo.bytes, photo.mime);
}
