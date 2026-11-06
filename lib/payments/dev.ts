import { paymentsMode } from "./gateway";

/** Fake checkout and test hooks exist only in fake mode on a local machine. */
export function devPaymentsEnabled() {
  try {
    return paymentsMode() === "fake" && !process.env.VERCEL && /localhost|127\.0\.0\.1/.test(process.env.APP_URL ?? "http://localhost:3000");
  } catch {
    return false;
  }
}
