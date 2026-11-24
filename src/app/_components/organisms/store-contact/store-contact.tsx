import {
  ArrowRight,
  Camera,
  MapPin,
  MessageCircle,
  Music2,
} from "lucide-react";
import Link from "next/link";
import { useId } from "react";

import { StoreButton } from "@/app/_components/atoms/store-button";
import { StoreEyebrow } from "@/app/_components/atoms/store-eyebrow";
import type { Dictionary } from "@/content";
import { interpolate } from "@/lib/i18n/interpolate";
import { cn } from "@/lib/utils";
import { formatLocalPhone } from "@/lib/utils/phone";

export interface StoreContactProps {
  /** The catalog, built by the caller with `localizePath()`. */
  browseHref: string;
  className?: string;
  /**
   * The page's own words, and the ones it shares: how to buy and the ways
   * to pay are the "how to buy" block's (FER-076), the links' names the
   * footer's (FER-078).
   */
  copy: Pick<
    Dictionary["storefront"],
    "contact" | "howToBuy" | "payments" | "shell"
  >;
  /**
   * Where to find the store (FER-078): its own line, in the language it is
   * in; `null` when the store wrote none.
   */
  location: { lang: string; text: string } | null;
  /** What the store's settings say of how to reach it; each may be unset. */
  store: {
    instagramUrl: string | null;
    name: string;
    tiktokUrl: string | null;
    whatsappNumber: string | null;
  };
}

/** The steps in the order they happen, as the "how to buy" block lists them. */
const STEPS = ["choose", "cart", "delivery"] as const;

/** The ways to pay, in the block's order. */
const PAYMENTS = ["cash", "cards", "mercadoPago", "transfer"] as const;

const TILE_HEADING_CLASS =
  "font-display store-display-section leading-display font-extrabold uppercase";

// `wrap-anywhere`: a label carries the store's name, up to 80 characters
// with no space to break at.
const SOCIAL_LINK_CLASS =
  "inline-flex min-h-11 items-center gap-2.5 text-base wrap-anywhere text-store-background hover:text-store-accent focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-store-accent";

/**
 * The store's contact page (FER-080): how to reach it, all from its
 * settings, and how to buy, from the interface's own words. Under the
 * store's name, the page's title and one line, up to three tiles, two
 * columns on a computer and one on a phone:
 *
 * - on the moss, the one loud tile, how to write to the store: WhatsApp as
 *   the page's main action, the lime pill with the number as people here
 *   write it, a chat on `wa.me`; and under it Instagram and TikTok, each
 *   only when the store has it. With no WhatsApp the tile holds the
 *   profiles alone; with neither, there is no tile;
 * - on the grey tile, where the store is, its own line, only when it wrote
 *   one;
 * - on the grey tile, how to buy in three steps, the ways to pay and the
 *   way into the catalog, which every store has.
 *
 * A store that loaded none of it says so in the page's line and still
 * offers the catalog: no empty tile is drawn. Nothing here needs a script.
 */
function StoreContact({
  browseHref,
  className,
  copy,
  location,
  store,
}: StoreContactProps) {
  const reachId = useId();
  const locationId = useId();
  const howId = useId();
  const paymentsId = useId();
  const socials = [
    store.instagramUrl
      ? {
          Icon: Camera,
          href: store.instagramUrl,
          key: "instagram",
          label: interpolate(copy.shell.instagram, { store: store.name }),
        }
      : null,
    store.tiktokUrl
      ? {
          Icon: Music2,
          href: store.tiktokUrl,
          key: "tiktok",
          label: interpolate(copy.shell.tiktok, { store: store.name }),
        }
      : null,
  ].filter((link) => link !== null);
  const hasReach = store.whatsappNumber !== null || socials.length > 0;
  // The profiles' title is the tile's own when there is no WhatsApp over it.
  const FollowHeading = store.whatsappNumber ? "h3" : "h2";

  return (
    <div
      className={cn(
        "mx-auto w-full max-w-7xl px-4 py-10 text-store-foreground md:px-7 md:py-16",
        className
      )}
      data-slot="store-contact"
      data-testid="store-contact"
    >
      <header className="flex flex-col items-start gap-4">
        <StoreEyebrow>{store.name}</StoreEyebrow>
        <h1 className="font-display store-display-page leading-display font-extrabold uppercase">
          {copy.contact.title}
        </h1>
        <p
          className="max-w-prose text-base text-store-muted md:text-lg"
          data-testid="store-contact-lead"
        >
          {hasReach || location ? copy.contact.lead : copy.contact.none}
        </p>
      </header>
      <div className="mt-8 grid items-start gap-4 md:mt-12 lg:grid-cols-2 lg:gap-6">
        {hasReach ? (
          <section
            aria-labelledby={reachId}
            className={cn(
              "flex min-w-0 flex-col items-start gap-5 bg-store-contrast p-5 text-store-background md:p-10",
              // Beside both grey tiles when the store says where it is.
              location && "lg:row-span-2 lg:self-stretch"
            )}
            data-slot="store-contact-reach"
            data-testid="store-contact-reach"
          >
            {store.whatsappNumber ? (
              <>
                <MessageCircle
                  aria-hidden="true"
                  className="size-6 text-store-accent"
                />
                <h2
                  className={cn(TILE_HEADING_CLASS, "text-store-accent")}
                  id={reachId}
                >
                  {copy.contact.whatsappTitle}
                </h2>
                <p className="max-w-[40ch] text-base text-store-contrast-muted">
                  {copy.contact.whatsappBody}
                </p>
                <StoreButton
                  asChild
                  // A label's size on a phone, so the number fits beside
                  // the word at 390 px; narrower, the number moves whole to
                  // a second line inside the pill, never widening the page.
                  className="max-w-full px-5 py-3 text-center text-xs whitespace-normal focus-visible:outline-store-accent md:px-7 md:text-sm"
                  size="lg"
                  variant="accent"
                >
                  <a
                    data-testid="store-contact-whatsapp"
                    // wa.me takes the number as digits only.
                    href={`https://wa.me/${store.whatsappNumber.replaceAll(/\D/gu, "")}`}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    <MessageCircle aria-hidden="true" />
                    <span>
                      {copy.shell.whatsapp}{" "}
                      <span className="whitespace-nowrap tabular-nums">
                        {formatLocalPhone(store.whatsappNumber)}
                      </span>
                    </span>
                    <span className="sr-only"> {copy.shell.newTab}</span>
                  </a>
                </StoreButton>
              </>
            ) : null}
            {socials.length > 0 ? (
              <div
                className={cn(
                  "w-full min-w-0",
                  store.whatsappNumber &&
                    "mt-2 border-t border-store-background/15 pt-6"
                )}
              >
                <FollowHeading
                  className="font-display text-xs leading-none font-extrabold text-store-accent uppercase"
                  id={store.whatsappNumber ? undefined : reachId}
                >
                  {copy.contact.follow}
                </FollowHeading>
                <ul className="mt-2">
                  {socials.map(({ Icon, href, key, label }) => (
                    <li key={key}>
                      <a
                        className={SOCIAL_LINK_CLASS}
                        data-testid={`store-contact-${key}`}
                        href={href}
                        rel="noopener noreferrer"
                        target="_blank"
                      >
                        <Icon aria-hidden="true" className="size-5 shrink-0" />
                        {label}
                        <span className="sr-only"> {copy.shell.newTab}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>
        ) : null}
        {location ? (
          <section
            aria-labelledby={locationId}
            className="flex min-w-0 flex-col items-start gap-4 bg-store-surface p-5 md:p-10"
            data-slot="store-contact-location"
            data-testid="store-contact-location"
          >
            <MapPin aria-hidden="true" className="size-6" />
            <h2 className={TILE_HEADING_CLASS} id={locationId}>
              {copy.shell.location}
            </h2>
            {/* The store's own words: they may have no space to break at. */}
            <address
              className="max-w-[40ch] text-base wrap-anywhere not-italic"
              lang={location.lang}
            >
              {location.text}
            </address>
          </section>
        ) : null}
        <section
          aria-labelledby={howId}
          className="flex min-w-0 flex-col items-start gap-5 bg-store-surface p-5 md:p-10"
          data-slot="store-contact-how"
          data-testid="store-contact-how"
        >
          <h2 className={TILE_HEADING_CLASS} id={howId}>
            {copy.howToBuy.title}
          </h2>
          <ol className="flex w-full flex-col">
            {STEPS.map((step, index) => (
              <li
                className="flex min-w-0 items-start gap-4 border-t border-store-line py-4 last:pb-0"
                key={step}
              >
                <span
                  aria-hidden="true"
                  className="shrink-0 font-display text-sm leading-tight font-extrabold text-store-muted tabular-nums"
                >
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div className="min-w-0">
                  <p className="font-display text-sm leading-tight font-extrabold wrap-break-word uppercase">
                    {copy.howToBuy.steps[step].title}
                  </p>
                  <p className="mt-1.5 text-sm text-store-muted">
                    {copy.howToBuy.steps[step].text}
                  </p>
                </div>
              </li>
            ))}
          </ol>
          <div className="w-full min-w-0">
            <StoreEyebrow id={paymentsId}>{copy.payments.title}</StoreEyebrow>
            <ul
              aria-labelledby={paymentsId}
              className="mt-3 flex flex-wrap gap-2"
            >
              {PAYMENTS.map((payment) => (
                <li
                  className="rounded-full border border-store-line bg-store-background px-3.5 py-2 text-sm leading-none"
                  key={payment}
                >
                  {copy.payments[payment]}
                </li>
              ))}
            </ul>
          </div>
          <StoreButton asChild className="mt-1" size="lg">
            <Link href={browseHref}>
              {copy.contact.browse}
              <ArrowRight aria-hidden="true" />
            </Link>
          </StoreButton>
        </section>
      </div>
    </div>
  );
}

export { StoreContact };
