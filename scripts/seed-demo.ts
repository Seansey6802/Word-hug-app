// Seeds FICTIONAL demonstration data into the LOCAL database so the studio
// queue isn't empty. Refuses to run against anything but localhost.
//   npm run seed:demo
import pg from "pg";
import { compose } from "../lib/composer/index.ts";
import { createHash, randomBytes } from "node:crypto";

// Local admin connection (seeding sets the demo flag, which the app role cannot).
const url = process.env.SEED_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
if (!/127\.0\.0\.1|localhost/.test(url)) throw new Error("seed:demo only runs against a local database.");

const DEMO = [
  { recipient: "Priya", sender: "Dev", category: "encourage", tone: "heartfelt", intensity: 3, occasion: "big_day", interests: ["bouldering"], note: "She defends her thesis on Thursday. Pronounced PREE-ya. Please make her cry (good tears)." },
  { recipient: "Marcus", sender: "The Tuesday Trivia Team", category: "roast", tone: "deadpan", intensity: 2, occasion: "birthday", interests: ["fantasy football"], note: "He's turning 40. Mention he still hasn't returned our cooler." },
  { recipient: "June", sender: "", category: "laugh", tone: "playful", intensity: 2, occasion: "tough_week", interests: ["crosswords", "her cat Biscuit"], note: "For me! Rough week. Ducks encouraged." },
] as const;

const c = new pg.Client({ connectionString: url });
await c.connect();
const existing = await c.query("select count(*)::int as n from app.hugs where demo");
if (existing.rows[0].n > 0) {
  console.log("Demo data already present.");
} else {
  for (const [k, d] of DEMO.entries()) {
    const seed = 1000 + k * 37;
    const h = compose({ category: d.category, tone: d.tone, intensity: d.intensity, occasion: d.occasion, interests: [...d.interests], name: d.recipient, seed });
    const { rows } = await c.query(
      `insert into app.hugs (token, owner_key_hash, for_self, recipient_name, sender_name, category, tone, intensity, occasion, interests, seed, headline, kicker, paragraphs, line_ids, demo)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,true) returning id`,
      [randomBytes(16).toString("base64url"), createHash("sha256").update(randomBytes(24)).digest("hex"), !d.sender, d.recipient, d.sender,
       d.category, d.tone, d.intensity, d.occasion, [...d.interests], seed, h.headline, h.kicker, h.paragraphs, h.lineIds],
    );
    // Book like a real customer: reserve, then confirm with a saved (fake, test-only) card.
    const r = await c.query("select * from app.reserve_video($1, $2)", [rows[0].id, d.note]);
    await c.query("select app.confirm_video_booking($1, 'fake', 'cus_demo', 'pm_fake_ok', null)", [r.rows[0].order_id]);
  }
  await c.query("update app.video_orders set demo = true where hug_id in (select id from app.hugs where demo)");
  console.log("Seeded 3 fictional demo bookings.");
}
await c.end();
