import { NextResponse } from "next/server";
import { verifyOwner } from "./ids";
import { getHugByToken } from "./store";

export const json = (body: unknown, status = 200) => NextResponse.json(body, { status });

/** Loads a hug and checks the owner key from the x-owner-key header. */
export async function ownerHug(req: Request, token: string) {
  const hug = await getHugByToken(token);
  if (!hug) return { error: json({ error: "This hug has been deleted or never existed." }, 404) } as const;
  if (!verifyOwner(req.headers.get("x-owner-key"), hug.ownerKeyHash)) {
    return { error: json({ error: "Only the person who made this hug can do that." }, 403) } as const;
  }
  return { hug } as const;
}

/** Streams a private file with HTTP Range support (iOS Safari needs it for video). */
export async function streamFile(
  req: Request,
  open: () => Promise<import("node:fs/promises").FileHandle>,
  size: number,
  mime: string,
) {
  const headers: Record<string, string> = {
    "Content-Type": mime,
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, no-store",
    "X-Robots-Tag": "noindex",
  };
  const range = req.headers.get("range");
  let start = 0;
  let end = size - 1;
  let status = 200;
  if (range) {
    const m = /bytes=(\d*)-(\d*)/.exec(range);
    if (m) {
      if (m[1]) start = Number(m[1]);
      if (m[2]) end = Math.min(Number(m[2]), size - 1);
      if (!m[1] && m[2]) {
        start = Math.max(0, size - Number(m[2]));
        end = size - 1;
      }
      if (start > end || start >= size) {
        return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
      }
      status = 206;
      headers["Content-Range"] = `bytes ${start}-${end}/${size}`;
    }
  }
  const length = end - start + 1;
  headers["Content-Length"] = String(length);
  const fh = await open();
  const buf = Buffer.alloc(length);
  await fh.read(buf, 0, length, start);
  await fh.close();
  return new Response(buf, { status, headers });
}
