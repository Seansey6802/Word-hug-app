import { publicAvailability } from "@/lib/server/repo";
import { fail, json } from "@/lib/server/http";

export const runtime = "nodejs";

export async function GET() {
  try {
    return json(await publicAvailability());
  } catch (e) {
    return fail(e);
  }
}
