import { cookies } from "next/headers";
import { getSecret } from "./store";
import { safeEqual, sign } from "./ids";

const COOKIE = "wh_studio";
const TTL_MS = 12 * 3600_000;

const passcode = () => process.env.STUDIO_PASSCODE || "demo-studio";

async function key() {
  return (await getSecret()) + "|" + passcode();
}

export async function checkPasscode(input: string) {
  return safeEqual(input, passcode());
}

export async function startSession() {
  const exp = String(Date.now() + TTL_MS);
  const jar = await cookies();
  jar.set(COOKIE, `${exp}.${sign(exp, await key())}`, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: TTL_MS / 1000,
  });
}

export async function endSession() {
  (await cookies()).delete(COOKIE);
}

export async function isStudio() {
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return false;
  const [exp, sig] = raw.split(".");
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  return safeEqual(sig, sign(exp, await key()));
}
