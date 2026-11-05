import Image from "next/image";
import { ButtonLink } from "@/components/Button";
import { SiteFooter, SiteHeader } from "@/components/SiteHeader";
import { HugMark } from "@/components/Wordmark";
import { CATEGORIES, CATEGORY_INFO } from "@/lib/catalog";
import { CATEGORY_PHOTO, PHOTOS, type Photo } from "@/lib/photos";
import { read } from "@/lib/server/store";
import { capacity } from "@/lib/server/hugs";
import { VIDEO_PRICE_CENTS, WRITTEN_PRICE_CENTS, formatPrice } from "@/lib/commerce/products";

const VIDEO_PRICE = formatPrice(VIDEO_PRICE_CENTS);

export const dynamic = "force-dynamic";

const ROMAN = ["I", "II", "III", "IV"];

function Figure({ photo, className = "", sizes, priority }: { photo: Photo; className?: string; sizes: string; priority?: boolean }) {
  return (
    <figure className={className}>
      <div className="relative h-full w-full overflow-hidden rounded-[1.75rem] bg-paper-2">
        <Image
          src={photo.src}
          alt={photo.alt}
          fill
          sizes={sizes}
          priority={priority}
          className="object-cover"
          style={{ objectPosition: photo.focus }}
        />
      </div>
    </figure>
  );
}

function CTA({ className = "" }: { className?: string }) {
  return (
    <div className={className}>
      <ButtonLink href="/create" size="lg" className="w-full sm:w-auto">
        Get a Word Hug
        <span aria-hidden className="text-xl leading-none">→</span>
      </ButtonLink>
      <p className="mt-3 text-center text-[0.82rem] text-ink-faint sm:text-left">
        {formatPrice(WRITTEN_PRICE_CENTS)} a hug · free during our preview · ready in about a minute
      </p>
    </div>
  );
}

export default async function Home() {
  const cap = await read(capacity);

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl px-5 sm:px-8">
        {/* ——— Hero ——— */}
        <section className="grid gap-8 pt-6 pb-4 md:grid-cols-[1.05fr_1fr] md:items-center md:gap-12 md:pt-14">
          <div>
            <p className="mb-5 text-[0.72rem] font-medium uppercase tracking-[0.22em] text-ink-faint">
              Personal compliments · Pep talks · Loving roasts · Pickup lines
            </p>
            <h1 className="font-display text-balance text-[3.1rem] leading-[0.95] tracking-[-0.035em] sm:text-[4.4rem] lg:text-[5.4rem]">
              Sometimes you just need a <span className="font-wonk text-clay">Word Hug.</span>
            </h1>
            <p className="mt-6 max-w-md text-pretty text-[1.08rem] leading-relaxed text-ink-soft">
              A few warm, funny, entirely personal words — for you, or for someone who needs them today.
              Want it out loud? A real human will record it.
            </p>
            <CTA className="mt-8" />
          </div>

          <div>
            <Figure photo={PHOTOS.hero} priority className="aspect-[4/5] md:aspect-[4/5]" sizes="(min-width: 768px) 50vw, 100vw" />
            <p className="mt-3 text-[0.8rem] italic text-ink-faint">{PHOTOS.hero.caption}</p>
          </div>
        </section>

        {/* ——— A sample, on paper ——— */}
        <section className="mt-20 grid gap-6 md:mt-28 md:grid-cols-[0.8fr_1.2fr] md:items-center md:gap-10">
          <div>
            <Figure photo={PHOTOS.pen} className="aspect-[16/10] md:aspect-[4/5]" sizes="(min-width: 768px) 40vw, 100vw" />
            <p className="mt-3 text-[0.8rem] italic text-ink-faint">{PHOTOS.pen.caption}</p>
          </div>
          <div className="grain mx-auto w-full max-w-3xl rounded-[2rem] bg-card px-7 py-10 shadow-[0_30px_80px_-40px_rgb(36_28_23/.35)] sm:px-14 sm:py-14">
            <p className="text-[0.7rem] font-medium uppercase tracking-[0.22em] text-clay">A sample Word Hug, for Sam</p>
            <blockquote className="mt-5 font-display text-pretty text-[1.6rem] leading-[1.25] tracking-[-0.015em] sm:text-[2.1rem]">
              “You don’t have to feel ready. Ready is a feeling; brave is a decision, and you’ve made it before.
              <span className="text-ink-soft"> Lower your shoulders from around your ears. There.</span>”
            </blockquote>
            <p className="mt-6 font-wonk text-lg text-ink-soft">— with love, Jess</p>
          </div>
        </section>

        {/* ——— Four kinds of hug ——— */}
        <section className="mt-24 md:mt-32">
          <div className="flex items-end justify-between gap-6">
            <h2 className="font-display text-balance text-[2.3rem] leading-[1] tracking-[-0.03em] sm:text-[3.2rem]">
              Four ways to be <span className="font-wonk">held.</span>
            </h2>
          </div>
          <p className="mt-4 max-w-lg text-ink-soft">
            Pick the feeling. Choose the tone and how strong you’d like it. We’ll do the rest — no greeting-card filler, ever.
          </p>

          <ol className="mt-10 divide-y divide-line border-y border-line">
            {CATEGORIES.map((c, k) => {
              const info = CATEGORY_INFO[c];
              const photo = CATEGORY_PHOTO[c];
              return (
                <li key={c} className="grid grid-cols-[1fr_6.5rem] items-start gap-5 py-7 sm:grid-cols-[4rem_1fr_1.1fr_10rem] sm:gap-8 sm:py-9">
                  <span className="hidden font-display text-2xl text-ink-faint sm:block">{ROMAN[k]}</span>
                  <div>
                    <h3 className="font-display text-[1.55rem] leading-tight tracking-[-0.02em]">
                      <span className="mr-2 font-display text-base text-ink-faint sm:hidden">{ROMAN[k]}.</span>
                      {info.label}
                    </h3>
                    <p className="mt-2 text-[0.95rem] leading-relaxed text-ink-soft">{info.blurb}</p>
                    <p className="mt-4 font-wonk text-[1.05rem] leading-snug text-ink sm:hidden">“{info.sample}”</p>
                  </div>
                  <p className="hidden font-wonk text-[1.15rem] leading-snug sm:block">“{info.sample}”</p>
                  <figure className="relative">
                    <div className="relative aspect-square overflow-hidden rounded-2xl bg-paper-2 sm:aspect-[4/5]">
                      <Image src={photo.src} alt={photo.alt} fill sizes="(min-width: 640px) 160px, 104px" className="object-cover" style={{ objectPosition: photo.focus }} />
                    </div>
                    <figcaption className="mt-2 hidden text-[0.72rem] italic leading-snug text-ink-faint sm:block">{photo.caption}</figcaption>
                  </figure>
                </li>
              );
            })}
          </ol>
        </section>

        {/* ——— How it works ——— */}
        <section className="mt-24 grid gap-10 md:mt-32 md:grid-cols-[1fr_1.1fr] md:items-center md:gap-16">
          <Figure photo={PHOTOS.notebook} className="aspect-[5/4] md:order-2" sizes="(min-width: 768px) 50vw, 100vw" />
          <div>
            <h2 className="font-display text-[2.3rem] leading-[1] tracking-[-0.03em] sm:text-[3rem]">
              About a minute, <span className="font-wonk">start to squeeze.</span>
            </h2>
            <ol className="mt-8 space-y-6">
              {[
                ["Pick a feeling", "Encouragement, a loving roast, a shameless pickup line, or pure nonsense."],
                ["Tell us a little", "A name, a few things they love, what’s going on. All optional. Add a photo if you like — it stays private."],
                ["Open it — or send it", "Unwrap it yourself, or send a private gift link. Save it, copy it, keep it forever."],
              ].map(([t, d], k) => (
                <li key={t} className="flex gap-5">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-ink/20 font-display text-lg">{k + 1}</span>
                  <div>
                    <h3 className="font-display text-xl tracking-[-0.01em]">{t}</h3>
                    <p className="mt-1 text-[0.96rem] leading-relaxed text-ink-soft">{d}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ——— Video ——— */}
        <section className="mt-24 overflow-hidden rounded-[2rem] bg-ink text-card md:mt-32">
          <div className="grid md:grid-cols-2">
            <div className="relative aspect-[4/3] md:aspect-auto">
              <Image src={PHOTOS.table.src} alt={PHOTOS.table.alt} fill sizes="(min-width: 768px) 50vw, 100vw" className="object-cover" style={{ objectPosition: PHOTOS.table.focus }} />
            </div>
            <div className="px-7 py-10 sm:px-12 sm:py-14">
              <p className="text-[0.72rem] font-medium uppercase tracking-[0.22em] text-blush">The founder video · {VIDEO_PRICE}</p>
              <h2 className="mt-4 font-display text-[2.2rem] leading-[1.02] tracking-[-0.03em] sm:text-[2.8rem]">
                Your hug, said out loud <span className="font-wonk text-blush">by a real human.</span>
              </h2>
              <p className="mt-5 text-pretty leading-relaxed text-card/75">
                Our founder personally reads your Word Hug on camera — properly, with feeling, with your pronunciation
                notes. Every video is recorded by hand, so there are only five each recording day.
              </p>
              <ul className="mt-6 space-y-2 text-[0.95rem] text-card/80">
                <li className="flex gap-3"><HugMark className="mt-1 h-4 w-4 shrink-0 text-blush" />Never AI. Never a voice clone. A person.</li>
                <li className="flex gap-3"><HugMark className="mt-1 h-4 w-4 shrink-0 text-blush" />We only say it’s ready when it’s actually recorded.</li>
                <li className="flex gap-3"><HugMark className="mt-1 h-4 w-4 shrink-0 text-blush" />Can’t record it? You’re not charged.</li>
              </ul>
              <p className="mt-8 inline-flex items-center gap-2 rounded-full border border-card/20 px-4 py-2 text-sm text-card/80">
                <span className={`h-2 w-2 rounded-full ${cap.remaining > 0 ? "bg-[#9fd49a]" : "bg-blush"}`} />
                {cap.remaining > 0
                  ? `${cap.remaining} of ${cap.capacity} founder recording slots left today`
                  : "Today’s recording slots are full — back tomorrow"}
              </p>
            </div>
          </div>
        </section>

        {/* ——— Promises ——— */}
        <section className="mt-24 md:mt-32">
          <Figure photo={PHOTOS.envelopes} className="mb-10 aspect-[16/9] md:aspect-[21/8]" sizes="100vw" />
          <h2 className="font-display text-[2rem] leading-[1.05] tracking-[-0.03em] sm:text-[2.6rem]">
            The fine print, <span className="font-wonk">warmly.</span>
          </h2>
          <dl className="mt-8 grid gap-x-10 gap-y-7 sm:grid-cols-2">
            {[
              ["Private by default", "Every hug lives at an unguessable link. Nothing is public, listed or searchable."],
              ["Your photo is just a photo", "We never analyze it or guess anything about anyone in it. It’s shown on your hug — that’s all."],
              ["Delete means delete", "Remove a photo or a whole hug whenever you like. Photos auto-delete after 30 days."],
              ["Roasts with a safety net", "We roast habits, never bodies, identities or anything that actually hurts."],
            ].map(([t, d]) => (
              <div key={t} className="border-t border-line pt-4">
                <dt className="font-display text-lg">{t}</dt>
                <dd className="mt-1 text-[0.95rem] leading-relaxed text-ink-soft">{d}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* ——— Close ——— */}
        <section className="mt-24 grid gap-8 md:mt-32 md:grid-cols-[1.1fr_1fr] md:items-center md:gap-14">
          <div>
            <Figure photo={PHOTOS.gift} className="aspect-[16/10]" sizes="(min-width: 768px) 55vw, 100vw" />
            <p className="mt-3 text-[0.8rem] italic text-ink-faint">{PHOTOS.gift.caption}</p>
          </div>
          <div>
            <h2 className="font-display text-balance text-[2.5rem] leading-[0.98] tracking-[-0.035em] sm:text-[3.4rem]">
              Go on. Someone needs one. <span className="font-wonk text-clay">It might be you.</span>
            </h2>
            <CTA className="mt-8" />
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
