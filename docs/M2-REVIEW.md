# Word Hug — M2 review: Supabase database & private media

Branch: `dev/m2-supabase` (from the approved `dev/mvp-prototype` baseline). Not merged, not deployed.
Everything was built and tested against a **local** Supabase stack (Docker, free). No cloud
projects were created, no paid services were used, and no billing is active.

## What M2 delivers

| Requirement | How it's met |
| --- | --- |
| 1. Secure customer & order data | All tables live in a private `app` schema that Supabase's public REST/GraphQL API does not expose. RLS is **enabled and forced** on all 14 tables. The public `anon`/`authenticated` roles have no privileges. The app connects as `wordhug_app`, a least-privilege role (not superuser, no RLS bypass, no access to `auth` or `storage`), with column-level grants. |
| 2. Private photo & video storage, expiring links | Two **private** buckets with type and size limits. Photos and videos are only ever reached through signed links issued after a capability check: 10 minutes for photos, 30 minutes for videos. Videos upload straight from the founder's phone through a **single-use** signed upload URL. |
| 3. Consent, founder permissions, automatic photo deletion | The database refuses a photo row without consent text, a consent time and a consent version, or one kept longer than 30 days. Expired photos are invisible to the app **immediately** (enforced by RLS), and the hourly job deletes the file first, then the row. The founder sees a photo only if the customer ticked "let the founder see it", and only while it's live. |
| 4. Order ownership & recovery | Owner keys stay on the device and are stored only as SHA-256 hashes. Optional recovery email: a rate-limited, hashed, single-use link that expires in 30 minutes, carried in the URL fragment so it never reaches server logs. Redeeming it **rotates** every owner key, so a lost phone loses control. |
| 5. Capacity & reservations, server-side | Bookings go through `app.book_video()`, which takes a row lock on each recording day. That guarantees no overbooking under concurrency. **Next-available-day** booking looks up to 14 days ahead, with a 5 pm same-day cutoff, per-day capacity and closed days. The **no-charge waitlist** offers a freed slot as a 24-hour **hold** that counts toward capacity. If the customer doesn't confirm, the hold expires and passes to the next person. |
| 6. Ready only after a real upload | Three layers enforce it. A `CHECK` constraint requires upload fields. A trigger requires the object to exist in `storage.objects`, and it blocks even a superuser. `mark_video_ready()` also verifies the object's size. The API refuses "ready" as a status change. |
| 7. Stripe-ready data model, not enabled | `products`, `payments` (demo statuses, idempotency key, Stripe IDs), `stripe_events` (webhook idempotency) and `customers.stripe_customer_id` exist. Constraints keep demo rows free of Stripe IDs. |
| 8. Automated tests | 56 automated checks across four suites, listed below. All pass. |

### Test results (latest run)

```
unit (composer, pricing)            12 / 12 pass
db   (RLS, privileges, consent,     23 / 23 pass
      concurrency, waitlist, storage)
api  (ownership/IDOR, sessions,     14 / 14 pass
      rate limits, uploads, recovery)
e2e  (iPhone 13, Playwright)         7 / 7  pass
typecheck 0 errors · npm audit 0 vulnerabilities · supabase db lint: no errors
```

Highlights:
- **Concurrency:** 30 simultaneous bookings for a 5-slot day yield exactly 5 bookings, both at the SQL level and through the live API. Overflow fills later days at 5 each. Twelve rapid repeat taps on one hug create one order.
- **"Ready" honesty:** a superuser `UPDATE … status='ready'` without a stored object fails. Finalizing a nonexistent upload fails, and the customer's video link stays 404 until the real upload is verified.
- **Privacy:** anon can't list, read or write either bucket. Signed links stop working after they expire. Deleting a hug removes its photo and video objects. A disguised HTML file sent as a "photo" is rejected by magic-byte check.
- **Recovery:** the response is identical whether or not an email has hugs. The link works once, and the old device's key stops working.

### Issues the tests and screenshot review caught, now fixed
- The recovery link did nothing if `/recover` was already open in that tab, because only the URL fragment changed. It now listens for fragment changes.
- Two buttons on the hug page were both labeled "Save". The recovery one is now "Save email".
- "No thanks, release the slot" was nearly invisible on the dark held-slot card. Its contrast is fixed.
- The local seed script was blocked from setting the demo flag, which shows the app role's least privilege works as intended. Seeding now uses the local admin connection.

## How to run it locally

```bash
npm install
npm run db:start            # local Supabase in Docker (first run downloads images)
npm run db:reset            # apply migrations + fictional demo bookings
npm run dev                 # or: npm run build && npm start
npm test && npm run test:db # unit + database suites
npm run test:api            # needs the app running on :3000
npm run test:e2e            # needs the app running on :3000
```

To test on an iPhone, set `SUPABASE_PUBLIC_URL=http://<your-LAN-IP>:54321` in `.env.local`, so signed media links are reachable from the phone.

## Remaining risks

**Needs action before any real customer**
1. **Only tested locally.** Hosted Supabase behavior is verified only in the sense that the code uses the same APIs: the pooler login as `wordhug_app`, TLS, storage limits and signed-URL origins. It needs a run on a real (private) project.
2. **Stripe authorizations expire after about 7 days, but bookings can be up to 14 days out.** M3 must either authorize closer to the recording day or charge at booking and refund automatically. Otherwise "charged only after upload" can't be honored for far-out bookings.
3. **Founder login is a single shared passcode.** It's rate-limited, sessions are server-side and revocable, and it can be stored as a hash. Before launch, it should move to Supabase Auth (founder email + MFA).
4. **No "a slot opened" notification yet.** Waitlisted customers only learn about a hold by revisiting their hug. That needs the email provider; the hold expires in 24 hours.
5. **Video size cap is 50 MB** (Supabase Free per-file limit). A minute of 1080p iPhone video can exceed that. Record at 720p/1080p and keep videos short, or move to Pro and add resumable uploads.

**Known trade-offs (acceptable for a private beta)**
6. **A gift link is a bearer capability.** Anyone it's forwarded to can view the hug, photo and video until the hug is deleted. A "reset link" feature would help.
7. **An issued signed link stays valid until it expires** (10 or 30 minutes), even if the hug is deleted in the meantime.
8. **Rate limiting trusts `X-Forwarded-For`.** Vercel sets that header correctly; behind other proxies it could be spoofed.
9. **Owner keys live in `localStorage`.** Cross-site scripting would expose them. Mitigations: React escaping, no third-party scripts, and anti-framing headers. A strict nonce-based CSP is future work.
10. **Recovery emails can be attached without verification.** That doesn't grant access to anything, but it could send unwanted mail. It's rate-limited (5 per hour per IP). A verification step can be added.
11. **Photo bytes stay in storage until the hourly job runs** (they're inaccessible the moment they expire). The job needs a scheduler such as Vercel Cron.
12. **Vercel's 4.5 MB request limit.** Photos are re-encoded on the phone to well under 1 MB, but an unusually large one could be refused.
13. **No backups on Supabase Free.** Pro includes daily backups.
14. **Retention:** written hugs and videos are kept until deleted. A policy is needed.
15. **Local development now requires Docker.**

## Ongoing infrastructure costs (estimates — verify current pricing)

These are list prices as I last knew them; providers change them, so please confirm on their pricing pages.

| Item | Private beta | Launch (5 videos/day) |
| --- | --- | --- |
| Supabase | **Free $0** (500 MB DB, 1 GB storage, ~5 GB egress, 50 MB/file, pauses after 1 week idle, no backups) | **Pro ~$25/mo** (8 GB DB, 100 GB storage, 250 GB egress, daily backups, no pausing) |
| Hosting (Vercel) | Hobby $0 (personal / non-commercial use only) | **Pro ~$20/mo per member** (required for commercial use; includes cron) |
| Email (recovery, "video ready") | Free tiers exist (e.g. ~3,000 emails/mo) | ~$0–15/mo |
| Domain | ~$10–20/yr | same |
| Stripe (M3, not active) | $0 | ~2.9% + 30¢ per card charge, **so about 33¢ of every $1 hug** and about 74¢ of a $15 video |
| **Total fixed** | **~$0/mo** | **~$45–60/mo** |

Video storage math: 5 videos/day × ~40 MB is about 6 GB a month of new storage, which exceeds Free's 1 GB within weeks. Video views also drive egress, so videos effectively require Supabase Pro at launch.

## Decisions & credentials needed before production infrastructure

**Decisions**
1. **Supabase plan and region:** Free for a private beta, then Pro at launch? Region: US East (closest to the studio's New York timezone)?
2. **Hosting:** Vercel Hobby for a password-protected private beta, Pro for launch?
3. **Founder login:** move to Supabase Auth (email + authenticator-app MFA)? Recommended.
4. **Email provider and sending address**, e.g. hello@yourdomain (for recovery and "slot opened / video ready" emails).
5. **Domain name.**
6. **Studio rules** (currently: America/New_York, 5 pm same-day cutoff, 14-day booking window, 24-hour waitlist hold, 5 per day). Confirm or change.
7. **Video rules:** maximum length, recording resolution, and how long videos are kept (forever, 1 year, 90 days?).
8. **Data retention** for written hugs and recovery emails.
9. **$1 payments:** at about 33¢ in card fees per hug, consider prepaid credits (e.g. 5 hugs for $5) when Stripe arrives.
10. **Legal:** privacy policy, terms, photo-consent wording, and minimum age, reviewed before launch.

**Credentials (provided by you, never pasted into chat)**
- A Supabase account/organization where the project is created. You create it, or invite me via the documented secure flow.
- In the host's encrypted env settings: `DATABASE_URL` (with a password you generate for `wordhug_app`), `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `STUDIO_PASSCODE_SHA256`, `CRON_SECRET`, SMTP credentials.
- For applying migrations: either you run `supabase db push` after `supabase link`, or you provide a Supabase personal access token through a secure secret, not chat.

M2 stops here, as agreed. Next steps (M3: hosted private beta, Stripe) wait for your approval.
