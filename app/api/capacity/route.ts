import { read } from "@/lib/server/store";
import { capacity } from "@/lib/server/hugs";
import { json } from "@/lib/server/http";

export const runtime = "nodejs";

export async function GET() {
  const c = await read(capacity);
  return json({ remaining: c.remaining, capacity: c.capacity, paused: c.paused });
}
