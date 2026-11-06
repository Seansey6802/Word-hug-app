# Word Hug

> Sometimes you just need a Word Hug.

A mobile-first prototype for personalized compliments, pep talks, loving roasts, cheesy pickup lines, and $15 personalized videos recorded by the founder.

**Status:** M3 on `dev/m3-staging-payments`: founder MFA, Stripe test-mode payment flows, beta studio rules. Local-only, fictional data, no live billing, not deployed. See [docs/M3-REVIEW.md](docs/M3-REVIEW.md) for the go/no-go, provider pricing, risks and what's needed for cloud staging. (M2: [docs/M2-REVIEW.md](docs/M2-REVIEW.md).)

## Run it

Requires Docker (for the local Supabase stack) and Node 22.

```bash
npm install
cp .env.example .env.local   # then paste SUPABASE_SERVICE_ROLE_KEY from `npx supabase status`
npm run db:start             # local Supabase: Postgres, Storage, Auth, Mailpit
npm run db:reset             # apply migrations + seed fictional demo bookings
npm run dev                  # http://localhost:3000
npm run dev:phone            # also reachable from your iPhone on the same Wi-Fi
```

### On an iPhone

1. Run `npm run dev:phone` on your computer.
2. Find your computer's local IP address (macOS: System Settings → Wi-Fi → Details).
3. In `.env.local`, set `SUPABASE_PUBLIC_URL=http://<that-ip>:54321` so photo and video links work on the phone.
4. On the iPhone, open `http://<that-ip>:3000` in Safari. Optional: Share → Add to Home Screen.

Clipboard access, the share sheet, and "Save image" all work over a plain LAN address in dev. Some browsers only allow `navigator.share` on HTTPS. If yours doesn't, the app falls back to copying.

### Founder studio

Create a founder account with `npm run staff:add -- you@example.com` (prints a one-time password), then sign in at `/studio`. First sign-in sets up an authenticator app (MFA); every sign-in needs the 6-digit code. Public sign-up is disabled. The studio shows bookings grouped by recording day, per-day capacity, closed days and the waitlist. On a phone, "Upload recording" can open the front camera; the file goes straight to private storage through a single-use signed link.

Recovery emails sent locally land in Mailpit at http://127.0.0.1:54324 (nothing is actually delivered).

## What's inside

| Area | Where |
| --- | --- |
| Homepage | `app/page.tsx` |
| Create flow (5 steps) | `components/create/CreateFlow.tsx` |
| Reveal, gift link, save/copy/share | `components/hug/*`, `app/h/[token]` |
| Video upsell and status | `components/hug/VideoPanel.tsx` |
| Studio queue, capacity, uploads | `app/studio/*`, `app/api/studio/*` |
| Writing engine and line library | `lib/composer/*` |
| Future commerce (products, Stripe boundary) | `lib/commerce/*`, `app/pricing` |
| Database schema, RLS, booking engine, buckets | `supabase/migrations/*.sql` |
| Data access (Postgres + private Storage) | `lib/server/repo.ts`, `lib/server/db.ts`, `lib/server/media.ts` |
| Ownership recovery | `app/recover`, `app/api/recovery/*`, `components/hug/KeepSafe.tsx` |
| Hourly maintenance (photo expiry, orphans, holds) | `app/api/cron/maintenance` |

### Pricing (prototype, demo-only)

- Written Word Hug: **$1**, free during the preview.
- Founder video: **$15**. Initial capacity is **5 per recording day**, adjustable in the studio.
- "A Pocketful" (10 written hugs, $8) and the weekly subscription: deferred and hidden. The old bundle that included a video was removed.

All prices live in `lib/commerce/products.ts`, and `npm test` checks them.

### Photography direction

Candid human connection, stationery and handwritten notes, and gifting moments, plus the occasional animal for humor (two of ten photos). Word Hug is not a pet brand.

### Writing

Hugs are assembled from an original, hand-written line library: an opener, body lines, a personal line, and a closer. The library is tagged by tone and intensity, and it reacts to names, interests, and the occasion. Lines a person has already seen are avoided, and "Write another version" redraws the hug. Roasts target habits only, never bodies or identity, and always end on love. The composer never receives the photo.

### Honesty and privacy rules, enforced in code

- **A video is "ready" only after a real file is uploaded.** The API refuses "ready" as a status change. The database also refuses it, through a `CHECK` constraint plus a trigger that requires the object to exist in private storage (even a superuser can't bypass it).
- **Capacity: 5 per recording day, enforced in the database.** Bookings take a row lock on the day, so concurrent requests can't overbook. Customers book the **next available day**; when everything is full they can join a **free waitlist**. A freed slot is held for the oldest waiter for 24 hours.
- **Data access.** All tables live in a private `app` schema with forced row-level security. The app connects as a least-privilege role. Public API keys can see nothing.
- **Gift links** use 128-bit random tokens, with `noindex` and `no-referrer`. A different key, kept only on the creator's device, controls editing and deletion.
- **Photos** need explicit consent, which is stored with its wording and version. They are re-encoded on the device to strip EXIF and GPS data, kept in a private bucket and served only through 10-minute signed links. They are never analyzed. They stop being visible the moment they expire (30 days), and the hourly job deletes the file. Owners can delete them at any time. The founder sees a photo only if the customer opted in.
- **Ownership** is a key held on the creator's device (stored only as a hash). An optional recovery email sends a single-use, 30-minute link, which rotates the keys so a lost device loses control.
- **Payments (test mode only).** Written hugs ($1) are paid through Checkout before the hug is created. For videos ($15), booking saves a card, recording requires a $15 authorization, and the charge is captured only after the upload is verified; the video is released only after capture. `PAYMENTS_MODE=fake` runs a local stand-in (test cards at `/dev/checkout/...`); `stripe_test` uses Stripe test mode. Live keys are refused.

## Tests

```bash
npm test             # unit: composer, pricing
npm run test:db      # database: RLS, privileges, consent, concurrency, waitlist, storage
npm run build && npm start   # then, in another terminal:
npm run test:api     # API security & functional tests
npm run test:e2e     # iPhone 13 end-to-end (Playwright)
npm run typecheck
```

Test suites only run against `localhost` and wipe local data; run `npm run db:reset` afterwards to restore the demo bookings.

## Photography

Photos are from Unsplash (8 people/stationery, 2 animals), used under the Unsplash License, and stored in `public/photos`. IDs are listed in `lib/photos.ts`. Confirm the photographer credits before launch, or replace these with an original shoot.

## Next milestones (pending approval)

1. Hosted private beta on a real Supabase project (decisions and credentials listed in docs/M2-REVIEW.md).
2. Stripe Checkout: $1 written hugs; $15 founder videos charged only after upload. Note that card authorizations expire after about 7 days.
3. Email notifications: "a slot opened" and "your video is ready".
4. Founder login via Supabase Auth + MFA.
