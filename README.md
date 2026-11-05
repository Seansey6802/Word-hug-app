# Word Hug

> Sometimes you just need a Word Hug.

A mobile-first prototype for personalized compliments, pep talks, loving roasts, cheesy pickup lines, and $5 videos recorded by a real human.

**Prototype status:** local-only. Uses fictional demo data. No real payments, no paid APIs, not deployed.

## Run it

```bash
npm install
npm run dev            # http://localhost:3000
npm run dev:phone      # also reachable from your iPhone on the same Wi-Fi
```

### On an iPhone

1. Run `npm run dev:phone` on your computer.
2. Find your computer's local IP address (macOS: System Settings → Wi-Fi → Details).
3. On the iPhone, open `http://<that-ip>:3000` in Safari. Optional: Share → Add to Home Screen.

Clipboard access, the share sheet, and "Save image" all work over a plain LAN address in dev. Some browsers only allow `navigator.share` on HTTPS. If yours doesn't, the app falls back to copying.

### Founder studio

Open `/studio`. The prototype passcode is `demo-studio`; set your own with `STUDIO_PASSCODE` in `.env.local`. On a phone, "Upload recording" can open the front camera directly.

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
| Database schema (Supabase, not applied) | `supabase/migrations/0001_init.sql` |

### Writing

Hugs are assembled from an original, hand-written line library: an opener, body lines, a personal line, and a closer. The library is tagged by tone and intensity, and it reacts to names, interests, and the occasion. Lines a person has already seen are avoided, and "Write another version" redraws the hug. Roasts target habits only, never bodies or identity, and always end on love. The composer never receives the photo.

### Honesty and privacy rules, enforced in code

- **A video is "ready" only after a real file is uploaded.** The studio API refuses to set `ready` manually. `effectiveStatus()` downgrades a "ready" order with no file. The SQL schema adds a `CHECK` constraint for the same rule.
- **Daily capacity.** The founder sets it in the studio and can pause orders. Customers see the real number of slots left.
- **Gift links** use 128-bit random tokens, with `noindex` and `no-referrer`. A different key, kept only on the creator's device, controls editing and deletion.
- **Photos** need explicit consent. They are re-encoded on the device to strip EXIF and GPS data, stored outside `public/`, never analyzed, deleted automatically after 30 days, and deletable at any time. The founder sees a photo only if the customer opted in.
- **Payments** go through a demo provider that records intended amounts only. `PAYMENTS_MODE` must be `demo`.

### Storage

The prototype stores everything in `./.data/` (git-ignored). Delete that folder to reset; the demo data is re-seeded on the next start. This will **not** work on Vercel's serverless file system. Production needs the Supabase adapter, which is a planned next step.

## Tests

```bash
npm test           # composer unit tests
npm run typecheck
npm run build
```

## Photography

Photos are from Unsplash, used under the Unsplash License, and stored in `public/photos`. IDs are listed in `lib/photos.ts`. Confirm the photographer credits before launch, or replace these with an original shoot.

## Next milestones (pending approval)

1. Supabase adapter and private storage buckets (signed URLs).
2. Stripe Checkout: $1 written hugs; $5 videos with manual capture, charged only after upload.
3. Email or SMS notification when a video is ready.
4. Bundles and subscriptions.
