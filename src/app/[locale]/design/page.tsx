import { ArrowRight, Search } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { StoreAnnouncementBar } from "@/app/_components/atoms/store-announcement-bar";
import { StoreArrowLink } from "@/app/_components/atoms/store-arrow-link";
import { StoreBadge } from "@/app/_components/atoms/store-badge";
import { StoreButton } from "@/app/_components/atoms/store-button";
import { StoreChip } from "@/app/_components/atoms/store-chip";
import { StoreCountUp } from "@/app/_components/atoms/store-count-up";
import { StoreEyebrow } from "@/app/_components/atoms/store-eyebrow";
import { StoreHeading } from "@/app/_components/atoms/store-heading";
import { StoreLogo } from "@/app/_components/atoms/store-logo";
import { StorePriceTag } from "@/app/_components/atoms/store-price-tag";
import { StoreReveal } from "@/app/_components/atoms/store-reveal";
import {
  STORE_CARD_SIZES,
  StoreArticleCard,
} from "@/app/_components/molecules/store-article-card";
import { StoreArticleRow } from "@/app/_components/molecules/store-article-row";
import { StoreBanner } from "@/app/_components/molecules/store-banner";
import { StoreBubbles } from "@/app/_components/molecules/store-bubbles";
import { StoreCoverCarousel } from "@/app/_components/molecules/store-cover-carousel";
import { StoreMarquee } from "@/app/_components/molecules/store-marquee";
import { StoreFooter } from "@/app/_components/organisms/store-footer";
import {
  STORE_MAIN_ID,
  StoreHeader,
} from "@/app/_components/organisms/store-header";
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
  photo: string;
  previousAmount?: number;
  unavailable?: boolean;
}

/**
 * Placeholder articles, amounts in minor units, on the seed's photos: both
 * currencies, an amount with cents, a new article, a reduced one and one
 * sold out.
 */
function buildSampleArticles(
  names: Dictionary["design"]["sample"]["articles"]
): SampleArticle[] {
  return [
    {
      amount: 129_000,
      currency: "UYU",
      isNew: true,
      name: names.necklace,
      photo: "/seed/necklace-1.jpg",
    },
    {
      amount: 89_000,
      currency: "UYU",
      name: names.bubbleGun,
      photo: "/seed/bubble-gun-1.jpg",
      previousAmount: 129_000,
    },
    {
      amount: 45_000,
      currency: "UYU",
      name: names.ring,
      photo: "/seed/ring-1.jpg",
    },
    {
      amount: 1250,
      currency: "USD",
      name: names.bracelet,
      photo: "/seed/bracelet-1.jpg",
    },
    {
      amount: 39_000,
      currency: "UYU",
      name: names.earrings,
      photo: "/seed/earrings-1.jpg",
      unavailable: true,
    },
    {
      amount: 159_000,
      currency: "UYU",
      isNew: true,
      name: names.chain,
      photo: "/seed/necklace-3.jpg",
    },
  ];
}

const SAMPLE_COUNT = 128;

const SECTION_CLASS = "mx-auto flex w-full max-w-7xl flex-col gap-6 px-4";

/** A store with every link set, so the footer shows each one. */
const SAMPLE_STORE = {
  instagramUrl: "https://www.instagram.com/lrmarket",
  name: "LR Market",
  tiktokUrl: "https://www.tiktok.com/@lrmarket",
  whatsappNumber: "+59899000000",
};

const SECTION_TITLE_CLASS =
  "font-display text-xs font-extrabold text-store-muted uppercase";

/** The five colors of the theme file and the three CSS derives from them. */
const SWATCHES = [
  ["background", "bg-store-background"],
  ["surface", "bg-store-surface"],
  ["foreground", "bg-store-foreground"],
  ["contrast", "bg-store-contrast"],
  ["accent", "bg-store-accent"],
  ["muted", "bg-store-muted"],
  ["line", "bg-store-line"],
] as const;

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

  const { comingSoon, design, storefront } = getDictionary(locale);
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
  // LR Market's navigation in Lucas's order (FER-044): the bubble guns in
  // no group, then Bijouterie holding four (FER-043).
  const categories = [
    { id: 6, name: sample.categories.bubbles, slug: "burbujeros" },
    { id: 1, name: sample.categories.jewelry, slug: "bijouterie" },
    { id: 2, name: sample.categories.chains, parentId: 1, slug: "cadenas" },
    { id: 3, name: sample.categories.rings, parentId: 1, slug: "anillos" },
    { id: 4, name: sample.categories.earrings, parentId: 1, slug: "aros" },
    { id: 5, name: sample.categories.bracelets, parentId: 1, slug: "pulseras" },
  ].map(({ parentId = null, ...category }) => ({
    ...category,
    lang: locale,
    parentId,
    path:
      parentId === null ? `/${category.slug}` : `/bijouterie/${category.slug}`,
  }));
  const banners = [
    {
      href: "#cover",
      id: "bubbles",
      src: "/seed/bubble-gun-1.jpg",
      title: sample.banners.bubbles,
    },
    {
      href: "#cover",
      id: "earrings",
      src: "/seed/earrings-2.jpg",
      title: sample.banners.earrings,
    },
    {
      href: "#cover",
      id: "rings",
      src: "/seed/ring-2.jpg",
      title: sample.banners.rings,
    },
  ];
  const cardLabels = { card: storefront.articleCard, price: storefront.price };

  return (
    <main
      className="flex min-h-screen flex-col gap-16 bg-store-background pb-24 text-store-foreground"
      data-slot="design-page"
      data-testid="design-page"
      // The target of the sample header's skip link.
      id={STORE_MAIN_ID}
      tabIndex={-1}
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
          {/* The sizes the storefront sets it at: the phone's header, the
              computer's, the footer's. The mark alone is only an icon. */}
          <div className="flex flex-wrap items-center justify-center gap-6 bg-store-contrast p-6 md:p-10">
            <StoreLogo className="h-10" />
            <StoreLogo className="h-12.5" />
            <StoreLogo className="h-15.5" />
            <StoreLogo className="h-8" variant="mark" />
          </div>
        </div>
      </section>

      <section className={SECTION_CLASS} data-testid="design-palette">
        <h2 className={SECTION_TITLE_CLASS}>{sections.palette}</h2>
        <ul className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {SWATCHES.map(([name, fill]) => (
            <li className="flex flex-col gap-2" key={name}>
              <span
                aria-hidden="true"
                className={`block aspect-video border border-store-line ${fill}`}
              />
              <span className="font-mono text-xs">store-{name}</span>
              <span className="text-sm text-store-muted">
                {sample.palette[name]}
              </span>
            </li>
          ))}
        </ul>
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

      <section className={SECTION_CLASS} data-testid="design-buttons">
        <h2 className={SECTION_TITLE_CLASS}>{sections.buttons}</h2>
        <div className="flex flex-wrap items-center gap-3">
          <StoreButton size="lg">{sample.buttons.primary}</StoreButton>
          <StoreButton variant="outline">{sample.buttons.outline}</StoreButton>
          <StoreButton variant="ghost">{sample.buttons.ghost}</StoreButton>
          <StoreButton
            aria-label={sample.buttons.primary}
            size="icon-lg"
            variant="accent"
          >
            <ArrowRight aria-hidden="true" />
          </StoreButton>
        </div>
        <div className="flex flex-wrap items-center gap-3 bg-store-contrast p-4">
          <StoreButton variant="contrast">
            {sample.buttons.contrast}
          </StoreButton>
          <StoreButton
            aria-label={storefront.shell.search}
            size="icon"
            variant="contrast"
          >
            <Search aria-hidden="true" />
          </StoreButton>
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
        <div className="flex flex-wrap items-center gap-2 bg-store-surface p-4">
          <StoreBadge>{storefront.articleCard.badgeNew}</StoreBadge>
        </div>
      </section>

      <section className={SECTION_CLASS} data-testid="design-price">
        <h2 className={SECTION_TITLE_CLASS}>{sections.price}</h2>
        <div className="flex flex-col gap-4">
          <StorePriceTag
            amount={129_000}
            currency="UYU"
            labels={storefront.price}
            locale={locale}
            size="lg"
          />
          <StorePriceTag
            amount={1250}
            currency="USD"
            labels={storefront.price}
            locale={locale}
          />
          <StorePriceTag
            amount={89_000}
            currency="UYU"
            labels={storefront.price}
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
            className="font-display store-display-figure leading-display font-extrabold"
            data-testid="design-count-up-figure"
            value={SAMPLE_COUNT}
          />
          <span className="pb-2 text-base font-medium">
            {sample.countLabel}
          </span>
        </p>
      </section>

      <section className="flex flex-col" data-testid="design-cards" id="cards">
        <h2 className={`${SECTION_CLASS} ${SECTION_TITLE_CLASS}`}>
          {sections.cards}
        </h2>
        <StoreArticleRow
          headingLevel="h3"
          items={buildSampleArticles(sample.articles).map((article) => ({
            content: (
              <StoreArticleCard
                amount={article.amount}
                currency={article.currency}
                headingLevel="h3"
                href="#cards"
                image={{ alt: article.name, src: article.photo }}
                isNew={article.isNew}
                labels={cardLabels}
                locale={locale}
                name={article.name}
                previousAmount={article.previousAmount}
                sizes={STORE_CARD_SIZES.row}
                unavailable={article.unavailable}
              />
            ),
            id: article.name,
          }))}
          title={sample.rowTitle}
          viewAllHref="#cards"
        />
      </section>

      <section className="flex flex-col gap-6" data-testid="design-banner">
        <h2 className={`${SECTION_CLASS} ${SECTION_TITLE_CLASS}`}>
          {sections.banner}
        </h2>
        <StoreBanner
          href="#cover"
          shopNow={storefront.banner.shopNow}
          src="/seed/earrings-2.jpg"
          title={sample.banners.earrings}
        />
      </section>

      <section
        className="flex flex-col gap-6"
        data-testid="design-cover"
        id="cover"
      >
        <h2 className={`${SECTION_CLASS} ${SECTION_TITLE_CLASS}`}>
          {sections.cover}
        </h2>
        <StoreCoverCarousel banners={banners} />
      </section>

      <section className="flex flex-col gap-6" data-testid="design-marquee">
        <h2 className={`${SECTION_CLASS} ${SECTION_TITLE_CLASS}`}>
          {sections.marquee}
        </h2>
        <StoreMarquee items={marquee} tone="contrast" />
        <StoreMarquee items={marquee} tone="accent" />
      </section>

      <section className={SECTION_CLASS} data-testid="design-bubbles">
        <h2 className={SECTION_TITLE_CLASS}>{sections.bubbles}</h2>
        {/* Positioned and tall: the burst is drawn over this block. */}
        <div className="relative flex min-h-80 items-start bg-store-contrast p-6">
          <StoreBubbles label={comingSoon.bubbles}>
            <StoreLogo className="h-14" />
          </StoreBubbles>
        </div>
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

      <section className="flex flex-col gap-6" data-testid="design-shell">
        <h2 className={`${SECTION_CLASS} ${SECTION_TITLE_CLASS}`}>
          {sections.shell}
        </h2>
        <div>
          <StoreAnnouncementBar>{sample.announcement}</StoreAnnouncementBar>
          {/* Not sticky here: it would stay over the rest of the gallery. */}
          <StoreHeader
            categories={Promise.resolve(categories)}
            className="static"
            copy={storefront.shell}
            locale={locale}
          />
        </div>
        <StoreFooter
          categories={categories}
          copy={storefront.shell}
          locale={locale}
          store={SAMPLE_STORE}
          tagline={{ lang: locale, text: comingSoon.eyebrow }}
        />
      </section>
    </main>
  );
}
