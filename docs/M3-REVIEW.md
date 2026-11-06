# Word Hug — M3 review: staging, payments (test mode), beta rules, launch readiness

Branch: `dev/m3-staging-payments`, built on `dev/m2-supabase`. Not merged, not deployed.
There was no live billing, no paid infrastructure, and only fictional data.

## Recommendation: NO-GO for a paid private beta today. Conditional GO for a test-mode beta.

Everything that could be built and verified locally is done, and all 86 automated checks pass.
Two required verifications have **not** happened, because they need your accounts:

1. **Cloud staging (part A).** No Supabase project exists. You declined the credential request for this session, and this sandbox can't open direct database connections. A cloud run is needed.
2. **Real Stripe test mode (part B).** The payment code ran end to end against a local stand-in for Stripe (the fake gateway). The Stripe client code is written but has **never been called against Stripe**. Sources of error that only real test mode can surface: Checkout's setup-mode behavior, Apple Pay, 3-D Secure test cards, and real webhook payloads.

**Conditional GO** for a small, invited beta (about 10 friends and family) using **Stripe test cards only**, once these four are true:
- staging passes the security suite;
- a Stripe test-mode run passes;
- an email provider is live;
- you approve the hosting and database plans.

**GO for real payments** additionally needs the legal and tax review below and your explicit approval to enable live mode. Live mode doesn't exist in the code today.

---

## What was built in M3

### A. Staging verification and founder security
| Item | Status |
| --- | --- |
| Confirm Supabase limits and costs before creating anything | Done (below). No resources created. |
| Re-run security, RLS, media, recovery, deletion and concurrency tests **in cloud staging** | **Blocked: needs credentials** (see "What I need"). The same suites pass locally (database 29/29, API 36/36). |
| Replace the shared passcode with individual accounts + MFA | **Done.** Each founder signs in with their own Supabase Auth account and password, plus an authenticator-app code (TOTP). First sign-in enrolls the authenticator via QR code. Public sign-up is disabled. The minimum password length is 12. The studio session is issued only for a verified two-factor login (AAL2) by an **active** `app.staff` member. Disabling a founder ends their session immediately. Accounts are created with `npm run staff:add -- email`. |
| Ordinary customers can't reach the studio | **Verified (tests):** customer links and keys, forged or tampered tokens, password-only (no MFA) logins, and MFA users who aren't staff are all refused. The dashboard never renders without a session. |

### B. Payments (Stripe test mode design, run against the fake gateway)
| Requirement | How it's met |
| --- | --- |
| Written hug $1, paid before delivery | The customer's choices are saved as a **draft** (not an order). Stripe Checkout takes $1. The hug is composed and created **only after** payment is confirmed. Declined or abandoned checkouts create nothing, and expired drafts delete their photo. |
| Founder video $15, charged only after upload | **Booking** saves a card with the customer present (Checkout setup mode, 3-D Secure if the bank asks). Nothing is charged. **Start recording** requires a successful off-session $15 authorization, and the database refuses to start recording without it. **Verified upload** triggers the capture. The video is **released to viewers only after the capture succeeds**. |
| No order without valid payment authorization | The slot is held for 30 minutes during checkout; that hold is not an order. The order exists only after the card is saved, and recording only after the $15 is authorized. All three are enforced in the database. |
| Videos withheld until capture | Every video link requires a captured payment. The tests cover failed captures, declines and disputes. |
| Failure recovery | Declined authorization: recording is blocked, the founder sees "don't record", and the customer is asked to update payment, re-authorizing with the card present. Failed capture: one fresh charge is attempted; if that fails, the video stays hidden until the customer pays. |
| Webhooks: retries, duplicates, order | Stripe's signature is verified on the raw body. Each event is processed exactly once. On processing errors the endpoint returns 500, so Stripe retries. Handlers are state-guarded, so late or out-of-order events can't move a payment backwards. |
| Refunds, disputes, cancellations | Studio refund button: the customer keeps the video, and a second refund is blocked. A dispute withholds the video until it's won; a lost dispute marks the payment refunded. Cancelling before recording charges nothing; cancelling after authorization releases the hold. |
| No live billing | `PAYMENTS_MODE` must be `fake` or `stripe_test`. Live keys (`sk_live_…`, `rk_live_…`) are rejected in code. Bundles and subscriptions remain disabled. |

**Limitations of the deferred-charge model (please read):**
1. **Authorization windows.** Stripe documents holds as valid for about 7 days when the customer initiates the payment, and only about 5 days for Visa merchant-initiated payments (precisely 4 days 18 hours). That's why the $15 is authorized at recording time, not at booking. Holding at booking would expire for bookings up to 7 days out. [Stripe: Place a hold on a payment method](https://docs.stripe.com/payments/place-a-hold-on-a-payment-method)
2. **Non-payment risk shifts to you.** A card saved at booking can be declined a week later (closed account, insufficient funds), and some banks demand 3-D Secure for merchant-initiated charges. Mitigations in the code: authorization *before* recording, so no work goes unpaid; customer-present recovery; and the video withheld until paid. Expected impact: a small percentage of bookings need a customer action.
3. **The founder can lose a slot.** If authorization fails on the recording day and the customer doesn't fix it in time, that slot goes unused. Possible policy: release such orders after 24 hours and re-offer the slot to the waitlist (not yet automated).
4. **Two charges' worth of fees on a few orders.** When a capture fails and a fresh charge succeeds, the first authorization is cancelled (not charged). Stripe doesn't charge for an uncaptured authorization in standard pricing, but verify this in test mode.
5. **Apple Pay in setup mode and the mandate wording** must be confirmed in real Stripe test mode. I added authorization wording to the booking button ("you authorize Word Hug to charge $15 once your video is recorded and uploaded").

### C. Beta studio rules (done, enforced in the database)
- America/Denver time zone; **5 videos per enabled recording day** (Monday–Friday by default, toggleable in the studio).
- **7-day booking window**: never past today + 6.
- **Same-day cutoff at 5 p.m.**, configurable in the studio (from none to midnight).
- **Waitlist holds** last up to 24 hours, and never past the held day's cutoff. A hold isn't offered at all with less than 45 minutes left.
- **Videos: 30–60 seconds at 720p, under 50 MB.** The studio warns before uploading anything outside that range. Duration is reported by the browser, so it's advisory, not server-verified.
- **30-day retention**: shown to customers at booking, on the video, on the pricing page and in the privacy page. Customers can download. After 30 days the link stops working at once, and the hourly job deletes the file.
- Changing the default capacity now updates upcoming days, unless a day was set individually. This was a bug found during M3.

---

## Test results (latest full run)

```
unit  (composer, prices, live-key refusal, deferred products)   13 / 13 pass
db    (RLS on 16 tables, privileges, consent, 30-way concurrency,  29 / 29 pass
       waitlist, storage, beta rules, retention)
api   (ownership, founder MFA, payments, webhooks, refunds,        36 / 36 pass
       disputes, recovery, retention)
e2e   (iPhone 13: pay $1, save card, founder MFA sign-in,           8 / 8  pass
       authorize → upload → capture, decline recovery, waitlist,
       recovery, deletion)
typecheck 0 errors · npm audit 0 vulnerabilities · supabase db lint: no errors
```

Bugs found and fixed during M3:
- Photos were never saved for paid hugs (a SQL type error). Caught by the API tests.
- A late webhook for a deleted hug would have retried forever. It's now acknowledged.
- Changing the default capacity didn't apply to days that already had bookings.
- The website said "two weeks" after the window became 7 days.
- Two photo captions implied the people pictured were customers (see licensing).
- The M2 `.env.example` had never actually been written. It's now complete.

## Provider pricing and limits

Live pricing pages couldn't be fetched from this sandbox (blocked network). These figures come from web search. Where sources disagree I've said so. **Please confirm each one on the provider's own page before committing.**

| Provider | Plan | What matters for Word Hug | Source quality |
| --- | --- | --- | --- |
| **Supabase** | Free, $0 | 500 MB database, **1 GB file storage**, ~5 GB egress, 50,000 monthly active users, **50 MB per file**, 2 free projects, **pauses after 1 week idle**, **no backups**. TOTP MFA appears to be included (paid plans add other MFA types). | Supabase docs (file limits, billing) + third parties |
| **Supabase** | Pro, $25/mo base | 8 GB database, 100 GB storage, 250 GB egress, $10 compute credit, daily backups, no pausing, files up to 500 GB. Overage: ~$0.125/GB database, ~$0.09/GB egress. | Third parties; confirm |
| **Vercel** | Hobby, $0 | **Not allowed for commercial use**, which includes a paid beta. | Vercel fair-use policy (official) |
| **Vercel** | Pro, ~$20/user/mo + usage | Required for any paid deployment; includes cron. | Third parties; confirm |
| Netlify | Free | Reportedly allows commercial use, but sites pause when monthly credits run out. | Third parties only |
| Render | ~$25/mo workspace | Free web services sleep after 15 minutes (30+ s cold start), so a paid instance is needed. | Third parties only |
| **Stripe** | Pay as you go | 2.9% + 30¢ per US card charge. Disputes: $15 (+$15 if you counter; sources disagree on refunds of that fee). Stripe Tax no-code: **0.5%** of volume where registered; registration and filing need a subscription. | Stripe support page + third parties |
| **Resend** | Free / ~$20/mo | Free: 3,000/mo per one source, 100/day per another. Paid: ~$20/mo for 50,000. | Conflicting; confirm |
| **Postmark** | ~$15/mo | 10,000 emails/mo; free tier 100/mo. Known for transactional deliverability. | Third parties |
| Amazon SES | ~$0.10 per 1,000 | Cheapest, but the most setup work (domain verification, sandbox exit). One source says new accounts cost $0.16 per 1,000 and the free tier ended July 2026. | Single source; confirm |

**Unit economics at Stripe's standard rate:** a $1 hug nets about **$0.67** (33¢ fee), and a $15 video nets about **$14.27**. Five videos a day on about 22 weekdays a month is about $1,570/month net from videos.

**Storage math for the beta rules:** 110 videos/month × ~20 MB at 720p is about 2.2 GB held at any time under 30-day retention. That **exceeds Supabase Free's 1 GB** at full capacity. Views of about 3 per video come to about 6.6 GB of egress, which **exceeds Free's ~5 GB**. Free works for staging and a beta under about 40 videos a month; **Pro is needed for a paid beta**, which also brings backups.

### Recommendations
- **Email:** start with **Resend** for the beta (free tier, simple API, works as Supabase Auth's SMTP). Move to **Postmark** (about $15/mo) if deliverability matters more than cost. Either is $0–15/mo at beta volume.
- **Hosting for a paid private beta:** **Vercel Pro** (about $20/mo) is the simplest permitted option for this Next.js app. Netlify Free is a possible cheaper alternative, unverified for this app. Keep the beta private with Vercel's deployment protection, or an invite gate.
- **Database:** Supabase **Free** for staging now. **Pro ($25)** before any real customer, for backups, no pausing, and room for videos.
- **Region:** put the database and the hosting functions in the same region, either both US East (Vercel's default) or both US West (Oregon). US East is simplest.
- **Expected fixed cost for a paid beta:** about **$45–60/month** (Supabase Pro + Vercel Pro + email + domain).

## Image licensing audit

All 10 photos are from Unsplash. Their IDs all start `photo-`, which means **free Unsplash License images, not Unsplash+ (paid)**. The free license allows commercial use without attribution. It does not allow selling the photos unaltered or using them to build a competing photo service, and it includes **no model releases**.
- **Fixed:** two captions implied the people pictured were Word Hug customers ("The exact moment someone read their Word Hug out loud"). Captions are now neutral, and a code comment forbids endorsement-style captions.
- **Remaining risk:** recognizable people appear in the hero (three friends) and the café-table photo. They're used editorially, but for launch marketing (ads, App Store, social) I recommend an original photo shoot with model releases.
- **Not verified:** photographer names and credits. unsplash.com blocks automated access, so this needs a manual check.

## Legal, policy and tax items for professional review

1. **Privacy policy:** what's collected (names, interests, photos, optional email, payment via Stripe), the 30-day photo and video retention, deletion rights, Colorado Privacy Act and CCPA applicability (likely below thresholds at beta scale, but good practice).
2. **Terms of service:** acceptable use. A "roast" sent to someone else could be used to bully, so this needs reporting and removal procedures, plus limits on names and interests text.
3. **Photo consent:** photos of other people, including children; consent wording; the founder-viewing permission; the 30-day limit.
4. **Minimum age:** suggest 13+ to use the service and 18+ to purchase (COPPA; cardholder rules). It's not yet stated anywhere.
5. **Refund policy:** written hugs (instant digital delivery: non-refundable or goodwill?); videos (never charged if not recorded; goodwill refunds keep the video).
6. **Card-on-file authorization:** the wording now shown at booking ("you authorize Word Hug to charge $15 once your video is recorded and uploaded") should be reviewed.
7. **Sales tax:** with a Denver studio, Colorado already taxes many digital goods, Denver (a home-rule city) taxes digital products under its own rules, and HB 26-1223 expands state tax to SaaS and digital products from Jan 1, 2027. The remote-seller threshold is $100,000. This needs a tax professional. Stripe Tax (0.5%) can calculate it, but registration comes first.
8. **Disclosures:** that written hugs are composed instantly from an original line library (not written live by a person), and that videos are recorded by a real person.

## Outstanding risks
- Cloud staging and real Stripe test mode are not yet verified (see recommendation).
- The founder's TOTP secret is the only second factor. Recovery if the phone is lost is manual: an operator disables the account and re-invites. A second founder account or recovery codes would help.
- Video duration is checked by the browser, not the server.
- Rate limits rely on Vercel's `X-Forwarded-For`.
- An order whose authorization fails isn't automatically released back to the waitlist.
- No email notifications yet ("video ready", "slot opened", "payment needed"). Customers must revisit their hug.
- The fake checkout page and its test hooks exist only when `PAYMENTS_MODE=fake` on localhost, and return 404 anywhere else. This is guarded in code but not covered by an automated test. Confirm it on staging.

## What I need from you to finish A and B

- **Supabase:** either (a) a personal access token, entered through the secure credential form for `api.supabase.com`, so I can check your org is on the **Free** plan, create one free staging project, apply migrations and run the suites; or (b) you create a free project yourself and share its project ref, URL and service-role key through the secure form.
- **Stripe:** a **test-mode** secret key (`sk_test_…`) through the secure form for `api.stripe.com`. I'll then run the real test-mode suite: Checkout setup mode, 3-D Secure test cards, off-session declines, capture, refunds and test disputes. Webhooks will be forwarded with the Stripe CLI (`stripe listen`), and edge cases fired with `stripe trigger`, all signed with the endpoint's test secret.
- **Network:** the staging project's host (`<ref>.supabase.co`) needs to be allowed in this environment. I'll propose that through the normal approval prompt.
- **Decisions:** confirm the recommended plans and region, and pick an email provider.

Credentials can also be added any time in this cloud environment's settings, under network secrets.

## Sources
- [Stripe: Place a hold on a payment method](https://docs.stripe.com/payments/place-a-hold-on-a-payment-method)
- [Stripe Tax pricing (support)](https://support.stripe.com/questions/understanding-stripe-tax-pricing)
- [Supabase file limits](https://supabase.com/docs/guides/storage/uploads/file-limits) · [Supabase billing](https://supabase.com/docs/guides/platform/billing-on-supabase) · [Supabase regions](https://supabase.com/docs/guides/platform/regions)
- [Supabase pricing summary (MakerKit)](https://makerkit.dev/blog/saas/supabase-pricing) · [Jetadmin guide](https://www.jetadmin.io/blog/supabase-pricing-2026-guide-to-plans-limits-and-real-world-costs/)
- [Vercel fair use policy](https://vercel.com/docs/limits/fair-use-policy) · [Vercel pricing explained (MassiveGrid)](https://massivegrid.com/blog/vercel-pricing-explained-2026/)
- [Stripe fees 2026 (Dodo Payments)](https://dodopayments.com/blogs/stripe-fees-calculator) · [Stripe chargeback fees (chargeback.io)](https://www.chargeback.io/es/blog/stripe-chargeback-fee)
- [Resend pricing 2026 (Automation Atlas)](https://automationatlas.io/answers/resend-pricing-explained-2026/) · [Postmark vs SES (Costbench)](https://www.costbench.com/compare/amazon-ses-vs-postmark/)
- [Netlify alternatives 2026 (DEV)](https://dev.to/devtoolpicks/best-netlify-alternatives-for-indie-hackers-in-2026-ceo)
- [Unsplash licensing traps (licenseorg)](https://licenseorg.com/blog/free-stock-photos-licensing-traps) · [Pixsy Unsplash guide](https://pixsy.com/image-licensing/unsplash-guide)
- [Colorado HB 26-1223 (Weaver)](https://weaver.com/resources/colorado-expands-sales-tax-to-software-saas-and-digital-products/) · [Denver sales tax (Quaderno)](https://quaderno.io/guides/denver-sales-tax/)
