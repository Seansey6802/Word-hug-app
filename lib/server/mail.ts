import nodemailer from "nodemailer";

/**
 * Transactional email. Locally this goes to Mailpit (http://127.0.0.1:54324),
 * which captures mail and never delivers it. Production needs an SMTP provider
 * (decision pending — see docs/M2-REVIEW.md). Without SMTP_URL, nothing is sent.
 */
export async function sendMail(to: string, subject: string, text: string) {
  const url = process.env.SMTP_URL;
  if (!url) {
    console.warn("[mail] SMTP_URL not set; email not sent:", subject);
    return false;
  }
  const t = nodemailer.createTransport(url);
  await t.sendMail({ from: process.env.MAIL_FROM ?? "Word Hug <hello@example.com>", to, subject, text });
  return true;
}
