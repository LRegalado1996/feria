import { Camera, MessageCircle, Music2 } from "lucide-react";
import Link from "next/link";

import { StoreLogo } from "@/app/_components/atoms/store-logo";
import type { Dictionary } from "@/content";
import { BRAND_NAME } from "@/lib/brand/logo";
import {
  catalogNavigation,
  type NavigationCategory,
} from "@/lib/catalog/navigation";
import { ALL_ARTICLES_PATH } from "@/lib/catalog/paths";
import type { Locale } from "@/lib/i18n/config";
import { interpolate } from "@/lib/i18n/interpolate";
import { localizePath } from "@/lib/i18n/paths";
import { cn } from "@/lib/utils";

/** Where the credit leads: Lucas's own site, as he chose on 2026-11-14. */
export const CREDIT_URL = "https://lucasregalado.com";

export interface StoreFooterProps {
  /**
   * The store's categories, in their order, for the shop's links: the
   * groups and the categories in none, as the header lists them (FER-044).
   */
  categories: readonly NavigationCategory[];
  className?: string;
  copy: Dictionary["storefront"]["shell"];
  locale: Locale;
  store: {
    instagramUrl: string | null;
    name: string;
    tiktokUrl: string | null;
    whatsappNumber: string | null;
  };
}

const HEADING_CLASS =
  "mb-3.5 font-display text-xs font-extrabold text-store-accent uppercase";

// `wrap-anywhere`: a label can carry the store's name, up to 80 characters
// with no space to break at.
const LINK_CLASS =
  "inline-flex min-h-11 items-center gap-2.5 text-sm wrap-anywhere text-store-background hover:text-store-accent focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-store-accent";

/**
 * One of the footer's blocks. Below `lg` they stack, each with room above
 * and below and a hairline over all but the first (FER-050); from `lg` up
 * they share one row with nothing of that, as before.
 */
const BLOCK_CLASS =
  "border-t border-store-background/15 py-8 first:border-t-0 first:pt-0 last:pb-0 lg:border-t-0 lg:py-0";

/**
 * A block's links: side by side on one line below `lg`, wrapping only when
 * they cannot fit (FER-050); one under the other from `lg` up.
 */
const LIST_CLASS = "flex flex-wrap gap-x-6 lg:block";

/**
 * Every page of the store ends here (FER-021, FER-039): dark, with the
 * accent for its headings. The full logo and, under it, Pepe's own story
 * of the stall, signed (FER-044); the shop's links (the catalog, then each
 * group and each category in none, in the header's order); help (how to
 * order, and a WhatsApp chat when the store has it); Instagram and TikTok
 * when it has them; and a quiet credit to Lucas Regalado.
 */
function StoreFooter({
  categories,
  className,
  copy,
  locale,
  store,
}: StoreFooterProps) {
  const socials = [
    store.instagramUrl
      ? {
          Icon: Camera,
          href: store.instagramUrl,
          key: "instagram",
          label: interpolate(copy.instagram, { store: store.name }),
        }
      : null,
    store.tiktokUrl
      ? {
          Icon: Music2,
          href: store.tiktokUrl,
          key: "tiktok",
          label: interpolate(copy.tiktok, { store: store.name }),
        }
      : null,
  ].filter((link) => link !== null);

  return (
    <footer
      aria-label={copy.footer}
      className={cn(
        "bg-store-contrast px-4 pt-10 pb-6 text-store-background md:px-7 md:pt-14 md:pb-7",
        className
      )}
      data-slot="store-footer"
      data-testid="store-footer"
    >
      {/* Spread across the whole width from `lg` up, after the reference
          store's footer: the story against the left edge, the last block
          against the right, even gaps between however many blocks the
          store has (three without social links, four with them). Below
          `lg` the blocks stack, one under the other, each with room and a
          hairline between it and the next, as the reference's phone footer
          does, so they read as separate things (FER-050). */}
      <div
        className="flex flex-col lg:flex-row lg:items-start lg:justify-between lg:gap-x-10"
        data-slot="store-footer-blocks"
        data-testid="store-footer-blocks"
      >
        <div
          className={cn(BLOCK_CLASS, "min-w-0 lg:shrink-0")}
          data-slot="store-footer-story"
          data-testid="store-footer-brand"
        >
          <Link
            aria-label={interpolate(copy.logo, { brand: BRAND_NAME })}
            className="inline-flex focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-store-accent"
            href={localizePath("/", locale)}
          >
            <StoreLogo aria-hidden="true" className="h-15.5" />
          </Link>
          {/* A quote with its author: the stall's story in Pepe's words,
              held to about 48 characters a line so it reads as a story. */}
          <figure
            className="mt-4 max-w-[40ch] text-sm"
            data-testid="store-footer-story"
          >
            <blockquote className="text-store-contrast-muted">
              <p>{copy.story.text}</p>
            </blockquote>
            <figcaption className="mt-2.5 font-display text-xs leading-none font-extrabold text-store-accent uppercase">
              {copy.story.signature}
            </figcaption>
          </figure>
        </div>
        <nav
          aria-labelledby="store-footer-shop"
          className={BLOCK_CLASS}
          data-testid="store-footer-shop"
        >
          <h2 className={HEADING_CLASS} id="store-footer-shop">
            {copy.shop}
          </h2>
          <ul className={LIST_CLASS}>
            <li>
              <Link
                className={LINK_CLASS}
                href={localizePath(ALL_ARTICLES_PATH, locale)}
              >
                {copy.catalog}
              </Link>
            </li>
            {/* What the header's line lists: a group's categories are on
                its page and in the header's list, not here (FER-044). */}
            {catalogNavigation(categories).map((entry) => (
              <li key={entry.slug}>
                <Link
                  className={LINK_CLASS}
                  href={localizePath(entry.path, locale)}
                  lang={entry.lang}
                >
                  {entry.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <section
          aria-labelledby="store-footer-help"
          className={BLOCK_CLASS}
          data-testid="store-footer-help"
        >
          <h2 className={HEADING_CLASS} id="store-footer-help">
            {copy.help}
          </h2>
          <p className="max-w-xs text-sm text-store-contrast-muted">
            {copy.howToOrder}
          </p>
          {store.whatsappNumber ? (
            <a
              className={cn(LINK_CLASS, "mt-2")}
              data-testid="store-footer-whatsapp"
              // wa.me takes the number as digits only.
              href={`https://wa.me/${store.whatsappNumber.replaceAll(/\D/gu, "")}`}
              rel="noopener noreferrer"
              target="_blank"
            >
              <MessageCircle aria-hidden="true" className="size-5 shrink-0" />
              {copy.whatsapp}
              <span className="sr-only"> {copy.newTab}</span>
            </a>
          ) : null}
        </section>
        {socials.length > 0 ? (
          <section
            aria-labelledby="store-footer-follow"
            className={BLOCK_CLASS}
            data-testid="store-footer-follow"
          >
            <h2 className={HEADING_CLASS} id="store-footer-follow">
              {copy.follow}
            </h2>
            <ul className={LIST_CLASS}>
              {socials.map(({ Icon, href, key, label }) => (
                <li key={key}>
                  <a
                    className={LINK_CLASS}
                    data-testid={`store-footer-${key}`}
                    href={href}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    <Icon aria-hidden="true" className="size-5 shrink-0" />
                    {label}
                    <span className="sr-only"> {copy.newTab}</span>
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
      <div className="mt-11 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-store-background/15 pt-3 text-sm text-store-contrast-muted">
        <p>{interpolate(copy.copyright, { store: store.name })}</p>
        <a
          className="inline-flex min-h-11 items-center underline-offset-4 hover:underline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-store-accent"
          data-testid="store-footer-credit"
          href={CREDIT_URL}
          rel="noopener noreferrer"
          target="_blank"
        >
          {copy.credit}
          <span className="sr-only"> {copy.newTab}</span>
        </a>
      </div>
    </footer>
  );
}

export { StoreFooter };
