import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { StoreArrowLink } from "@/app/_components/atoms/store-arrow-link";
import { StoreBadge } from "@/app/_components/atoms/store-badge";
import { StoreChip } from "@/app/_components/atoms/store-chip";
import { StoreCountUp } from "@/app/_components/atoms/store-count-up";
import { StoreEyebrow } from "@/app/_components/atoms/store-eyebrow";
import { StoreHeading } from "@/app/_components/atoms/store-heading";
import { StoreLogo } from "@/app/_components/atoms/store-logo";
import { StorePriceTag } from "@/app/_components/atoms/store-price-tag";
import { StoreReveal } from "@/app/_components/atoms/store-reveal";
import { StoreArticleCard } from "@/app/_components/molecules/store-article-card";
import { StoreMarquee } from "@/app/_components/molecules/store-marquee";
import { StoreSlider } from "@/app/_components/molecules/store-slider";
import { type Dictionary, getDictionary } from "@/content";
import { detectStableEnvironment, isProductionDeploy } from "@/lib/env/deploy";
import { buildAlternates } from "@/lib/i18n/metadata";
import { readLocale } from "@/lib/i18n/read-locale";
import type { Currency } from "@/lib/utils/format";

interface DesignPageProps {
  params: Promise<{ locale: string }>;
}

interface SampleArticle {
  amount: number;
  currency: Currency;
  isNew?: boolean;
  name: string;
  previousAmount?: number;
}

/**
 * Placeholder articles, amounts in minor units: both currencies, an amount
 * with cents, a new article and a reduced one.
 */
function buildSampleArticles(
  names: Dictionary["design"]["sample"]["articles"]
): SampleArticle[] {
  return [
    { amount: 129_000, currency: "UYU", isNew: true, name: names.necklace },
    {
      amount: 89_000,
      currency: "UYU",
      name: names.bubbleGun,
      previousAmount: 129_000,
    },
    { amount: 45_000, currency: "UYU", name: names.ring },
    { amount: 1250, currency: "USD", name: names.bracelet },
    { amount: 39_000, currency: "UYU", name: names.earrings },
    { amount: 159_000, currency: "UYU", isNew: true, name: names.chain },
  ];
}

const SAMPLE_COUNT = 128;

const SECTION_CLASS = "mx-auto flex w-full max-w-7xl flex-col gap-6 px-4";
const SECTION_TITLE_CLASS = "store-eyebrow text-store-muted";

export async function generateMetadata({
  params,
}: DesignPageProps): Promise<Metadata> {
  const locale = await readLocale(params);

  return {
    alternates: buildAlternates("/design", locale),
    robots: { follow: false, index: false },
    title: getDictionary(locale).design.metaTitle,
  };
}

/**
 * The storefront's component gallery: every piece of design.md § Storefront
 * on one page, in the language of the URL. It is a working tool, so the live
 * site answers 404: production is the Vercel production deployment or the
 * `main` branch, both fixed when the deployment is built.
 */
export default async function DesignPage({ params }: DesignPageProps) {
  const locale = await readLocale(params);

  if (
    isProductionDeploy() ||
    detectStableEnvironment(process.env) === "production"
  ) {
    notFound();
  }

  const { design, storefront } = getDictionary(locale);
  const { sample, sections } = design;
  const heroLines = [sample.hero.lineOne, sample.hero.lineTwo];
  const sectionLines = [sample.section.lineOne, sample.section.lineTwo];
  const chips = [
    sample.chips.all,
    sample.chips.necklaces,
    sample.chips.rings,
    sample.chips.bubbles,
  ];
  const marquee = [
    sample.marquee.brand,
    sample.marquee.products,
    sample.marquee.fair,
  ];

  return (
    <main
      className="flex min-h-screen flex-col gap-16 bg-store-background pb-24 text-store-foreground"
      data-slot="design-page"
      data-testid="design-page"
    >
      <header className="bg-store-contrast py-12 md:py-20">
        <div className={SECTION_CLASS}>
          <StoreEyebrow tone="contrast">{design.intro.eyebrow}</StoreEyebrow>
          <StoreHeading
            accentLine={1}
            as="h1"
            className="text-store-background"
            lines={[design.intro.title.lineOne, design.intro.title.lineTwo]}
            size="hero"
          />
          <p className="max-w-prose text-base text-store-background">
            {design.intro.lead}
          </p>
        </div>
      </header>

      <section className={SECTION_CLASS} data-testid="design-logo">
        <h2 className={SECTION_TITLE_CLASS}>{sections.logo}</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="flex items-center justify-center bg-store-surface p-10">
            <StoreLogo className="h-32" />
          </div>
          <div className="flex items-center justify-center bg-store-contrast p-10">
            <StoreLogo className="h-32" />
          </div>
          <div className="flex items-center justify-center bg-store-surface p-10">
            <StoreLogo className="h-32" tone="contrast" />
          </div>
          {/* Under 96 px the name cannot be read: the mark goes alone. */}
          <div className="flex flex-wrap items-end justify-center gap-6 bg-store-surface p-6 md:p-10">
            <StoreLogo className="h-12" variant="mark" />
            <StoreLogo className="h-6" variant="mark" />
            <StoreLogo className="h-12" tone="contrast" variant="mark" />
            <StoreLogo className="h-6" tone="contrast" variant="mark" />
          </div>
        </div>
      </section>

      <section className={SECTION_CLASS} data-testid="design-type">
        <h2 className={SECTION_TITLE_CLASS}>{sections.type}</h2>
        <div className="flex flex-col gap-4 bg-store-contrast p-6 md:p-10">
          <StoreEyebrow tone="contrast">{sample.eyebrow}</StoreEyebrow>
          <StoreHeading
            accentLine={1}
            as="h3"
            className="text-store-background"
            lines={heroLines}
            size="hero"
          />
        </div>
        <div className="flex flex-col gap-4 bg-store-surface p-6 md:p-10">
          <StoreEyebrow>{sample.eyebrow}</StoreEyebrow>
          <StoreHeading as="h3" lines={sectionLines} size="section" />
          <p className="max-w-prose text-base">{sample.body}</p>
        </div>
      </section>

      <section className={SECTION_CLASS} data-testid="design-chips" id="chips">
        <h2 className={SECTION_TITLE_CLASS}>{sections.chips}</h2>
        <ul className="flex flex-wrap gap-2">
          {chips.map((chip, index) => (
            <li key={chip}>
              <StoreChip asChild selected={index === 0}>
                <a
                  aria-current={index === 0 ? "true" : undefined}
                  href="#chips"
                >
                  {chip}
                </a>
              </StoreChip>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap items-center gap-2">
          <StoreBadge tone="accent">
            {storefront.articleCard.badgeNew}
          </StoreBadge>
          <StoreBadge tone="contrast">
            {storefront.articleCard.badgeSale}
          </StoreBadge>
        </div>
      </section>

      <section className={SECTION_CLASS} data-testid="design-price">
        <h2 className={SECTION_TITLE_CLASS}>{sections.price}</h2>
        <div className="flex flex-col gap-4 bg-store-surface p-6">
          <StorePriceTag
            amount={129_000}
            currency="UYU"
            locale={locale}
            size="lg"
          />
          <StorePriceTag amount={1250} currency="USD" locale={locale} />
          <StorePriceTag
            amount={89_000}
            currency="UYU"
            locale={locale}
            previousAmount={129_000}
          />
        </div>
      </section>

      <section className={SECTION_CLASS} data-testid="design-link">
        <h2 className={SECTION_TITLE_CLASS}>{sections.link}</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="bg-store-surface p-6">
            <StoreArrowLink href="#cards">{sample.linkLabel}</StoreArrowLink>
          </div>
          <div className="bg-store-contrast p-6">
            <StoreArrowLink href="#cards" tone="contrast">
              {sample.linkLabel}
            </StoreArrowLink>
          </div>
        </div>
      </section>

      <section className={SECTION_CLASS} data-testid="design-count-up">
        <h2 className={SECTION_TITLE_CLASS}>{sections.countUp}</h2>
        <p className="flex flex-wrap items-end gap-x-4 gap-y-1 bg-store-accent p-6">
          <StoreCountUp
            className="font-display store-display-figure leading-display font-normal tracking-display"
            data-testid="design-count-up-figure"
            value={SAMPLE_COUNT}
          />
          <span className="pb-2 text-base font-medium">
            {sample.countLabel}
          </span>
        </p>
      </section>

      <section className={SECTION_CLASS} data-testid="design-cards" id="cards">
        <h2 className={SECTION_TITLE_CLASS}>{sections.cards}</h2>
        <StoreSlider
          heading={
            <StoreHeading
              as="h3"
              lines={[sample.sliderHeading]}
              size="section"
            />
          }
          label={sample.sliderLabel}
          slides={buildSampleArticles(sample.articles).map((article) => ({
            content: (
              <StoreArticleCard
                amount={article.amount}
                currency={article.currency}
                headingLevel="h3"
                href="#cards"
                image={null}
                isNew={article.isNew}
                locale={locale}
                name={article.name}
                previousAmount={article.previousAmount}
              />
            ),
            id: article.name,
          }))}
        />
      </section>

      <section className="flex flex-col gap-6" data-testid="design-marquee">
        <h2 className={`${SECTION_CLASS} ${SECTION_TITLE_CLASS}`}>
          {sections.marquee}
        </h2>
        <StoreMarquee items={marquee} tone="contrast" />
        <StoreMarquee items={marquee} tone="accent" />
      </section>

      <section className={SECTION_CLASS} data-testid="design-reveal">
        <h2 className={SECTION_TITLE_CLASS}>{sections.reveal}</h2>
        <StoreReveal
          className="flex flex-col gap-4 bg-store-surface p-6 md:p-10"
          data-testid="design-reveal-block"
        >
          <StoreHeading as="h3" lines={sectionLines} size="section" />
          <p className="max-w-prose text-base">{sample.revealBody}</p>
        </StoreReveal>
      </section>
    </main>
  );
}
