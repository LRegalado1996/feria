import { Camera, MapPin, MessageCircle, Music2 } from "lucide-react";
import Link from "next/link";

import { StoreLogo } from "@/app/_components/atoms/store-logo";
import type { Dictionary } from "@/content";
import { BRAND_NAME } from "@/lib/brand/logo";
import {
  catalogNavigation,
  type NavigationCategory,
} from "@/lib/catalog/navigation";
import { ALL_ARTICLES_PATH, CONTACT_PATH } from "@/lib/catalog/paths";
import type { Locale } from "@/lib/i18n/config";
import { interpolate } from "@/lib/i18n/interpolate";
import { localizePath } from "@/lib/i18n/paths";
import { cn } from "@/lib/utils";
import { formatLocalPhone } from "@/lib/utils/phone";

/** Where the credit leads: Lucas's own site, as he chose on 2026-11-14. */
export const CREDIT_URL = "https://lucasregalado.com";

export interface StoreFooterProps {
  /**
   * The categories the storefront lists (those with a published article,
   * FER-079), in their order, for the shop's links: the groups and the
   * categories in none, as the header lists them (FER-044).
   */
  categories: readonly NavigationCategory[];
  className?: string;
  copy: Dictionary["storefront"]["shell"];
  locale: Locale;
  /**
   * Where to find the store (FER-078): the store's own line, from its
   * settings, in the language it is in; `null` or left out when it has
   * none, and the footer then says nothing of it.
   */
  location?: { lang: string; text: string } | null;
  /** The ways to pay, the "how to buy" block's own list (FER-076). */
  payments: Dictionary["storefront"]["payments"];
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

/** The ways to pay, in the order the "how to buy" block lists them. */
const PAYMENTS = ["cash", "cards", "mercadoPago", "transfer"] as const;

/**
 * Every page of the store ends here (FER-021, FER-039): dark, with the
 * accent for its headings. What a small shop's footer answers (FER-078):
 * who they are (the full logo and, under it, Pepe's own story of the
 * stall, signed, FER-044); what they sell (the catalog, then each group
 * and each category in none that has something published, in the header's
 * order); how to buy and how to pay (one line, then the ways to pay, then
 * the way to the contact page, FER-080); and
 * how to reach them: where the store is (its own line, from its
 * settings), its WhatsApp as a chat link that shows the number as people
 * here write it, and Instagram and TikTok, each only when the store has
 * it. Last, "© store" and a quiet credit to Lucas Regalado.
 */
function StoreFooter({
  categories,
  className,
  copy,
  locale,
  location = null,
  payments,
  store,
}: StoreFooterProps) {
  const hasContact =
    location !== null ||
    store.whatsappNumber !== null ||
    store.instagramUrl !== null ||
    store.tiktokUrl !== null;
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
          store has (three with no way to reach it, four with one). Below
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
          className={cn(BLOCK_CLASS, "min-w-0")}
          data-testid="store-footer-help"
        >
          <h2 className={HEADING_CLASS} id="store-footer-help">
            {copy.help}
          </h2>
          <p
            className="max-w-xs text-sm text-store-contrast-muted"
            data-testid="store-footer-how-to-order"
          >
            {copy.howToOrder}
          </p>
          <p
            className="mt-4 text-sm text-store-background"
            id="store-footer-payments"
          >
            {payments.title}
          </p>
          {/* One line of words apart by dots, which only the eye needs:
              a screen reader hears a list of four. */}
          <ul
            aria-labelledby="store-footer-payments"
            className="mt-1 max-w-xs text-sm text-store-contrast-muted"
            data-testid="store-footer-payments"
          >
            {PAYMENTS.map((payment, index) => (
              <li className="inline" key={payment}>
                {index > 0 ? <span aria-hidden="true"> · </span> : null}
                {payments[payment]}
              </li>
            ))}
          </ul>
          {/* Always there, whatever the store has loaded: the contact
              page says so itself (FER-080). */}
          <Link
            className={cn(LINK_CLASS, "mt-2")}
            data-testid="store-footer-contact-page"
            href={localizePath(CONTACT_PATH, locale)}
          >
            {copy.contactPage}
          </Link>
        </section>
        {hasContact ? (
          <section
            aria-labelledby="store-footer-contact"
            className={cn(BLOCK_CLASS, "min-w-0")}
            data-testid="store-footer-contact"
          >
            {/* The heading leads to the contact page too: it is what a
                shopper presses first. On a phone it is a thumb's target,
                44 px tall inside the heading's own line (the margins give
                back what the height takes), and the keyboard's focus is
                the ring the footer's other links draw. */}
            <h2 className={HEADING_CLASS} id="store-footer-contact">
              <Link
                className="underline-offset-4 hover:underline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-store-accent max-md:-my-3.5 max-md:inline-flex max-md:min-h-11 max-md:items-center"
                data-testid="store-footer-contact-heading-link"
                href={localizePath(CONTACT_PATH, locale)}
              >
                {copy.contact}
              </Link>
            </h2>
            {location ? (
              <div
                className="mb-2 flex max-w-xs items-start gap-2.5 text-sm"
                data-testid="store-footer-location"
              >
                <MapPin aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
                <div className="min-w-0">
                  <p className="text-store-background">{copy.location}</p>
                  {/* The store's own words: they may be long, with no
                      space to break at. */}
                  <address
                    className="mt-1 wrap-anywhere text-store-contrast-muted not-italic"
                    lang={location.lang}
                  >
                    {location.text}
                  </address>
                </div>
              </div>
            ) : null}
            <ul className={LIST_CLASS}>
              {store.whatsappNumber ? (
                <li>
                  <a
                    className={LINK_CLASS}
                    data-testid="store-footer-whatsapp"
                    // wa.me takes the number as digits only.
                    href={`https://wa.me/${store.whatsappNumber.replaceAll(/\D/gu, "")}`}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    <MessageCircle
                      aria-hidden="true"
                      className="size-5 shrink-0"
                    />
                    <span>
                      {copy.whatsapp}{" "}
                      <span className="tabular-nums">
                        {formatLocalPhone(store.whatsappNumber)}
                      </span>
                    </span>
                    <span className="sr-only"> {copy.newTab}</span>
                  </a>
                </li>
              ) : null}
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
