import { CircleCheck, MessageCircle } from "lucide-react";
import Link from "next/link";

import { StoreButton } from "@/app/_components/atoms/store-button";
import { StoreArticleBand } from "@/app/_components/molecules/store-article-band";
import {
  STORE_CARD_SIZES,
  StoreArticleCard,
} from "@/app/_components/molecules/store-article-card";
import { StoreArticleRow } from "@/app/_components/molecules/store-article-row";
import { StoreOrderStepper } from "@/app/_components/molecules/store-order-stepper";
import type { StoreRelatedArticle } from "@/app/_components/organisms/store-article";
import type { Dictionary } from "@/content";
import { articlePath } from "@/lib/catalog/paths";
import type { Locale } from "@/lib/i18n/config";
import { interpolate } from "@/lib/i18n/interpolate";
import { localizePath } from "@/lib/i18n/paths";
import type { OrderStatus } from "@/lib/schemas/order";
import { cn } from "@/lib/utils";
import { type Currency, formatPrice } from "@/lib/utils/format";

export interface StoreOrderProps {
  /**
   * One category's articles, drawn per visit, for the row under the band
   * (FER-051); `null` when the store has none to show.
   */
  again: {
    articles: readonly StoreRelatedArticle[];
    /** The category's page, where "Ver todo" leads. */
    href: string;
    /** The category's name, which names that link. */
    name: string;
  } | null;
  /** Where to keep browsing: the store's catalog. */
  catalogHref: string;
  className?: string;
  /** The storefront's words, from `getDictionary` on the server. */
  copy: Dictionary["storefront"];
  locale: Locale;
  order: {
    code: string;
    currencyCode: Currency;
    /** Already masked: only its country code and last digits show. */
    customerPhone: string;
    items: { quantity: number; title: string; unitPriceAmount: number }[];
    note: string | null;
    status: OrderStatus;
    totalAmount: number;
  };
  /** A chat with the store about this order, when it has WhatsApp. */
  whatsappHref: string | null;
}

/** A small heading in the display face, between hairlines' sections. */
const LABEL_CLASS =
  "font-display text-sm leading-tight font-extrabold uppercase";

/**
 * A placed order's page (FER-026, FER-051): that it was received, the code
 * to say at the stall, where the order is now as a row of steps (under the
 * banner on a computer, at the end of the order on a phone, above its
 * buttons), what was ordered and for how much, what happens next. Then the
 * festive band, apart, and a row of one category's articles as a hook to
 * order again. WhatsApp is a convenience: the store reads the order in its
 * admin either way.
 */
function StoreOrder({
  again,
  catalogHref,
  className,
  copy,
  locale,
  order,
  whatsappHref,
}: StoreOrderProps) {
  const labels = copy.order;
  const cardLabels = { card: copy.articleCard, price: copy.price };

  return (
    <div
      className={cn("flex flex-col text-store-foreground", className)}
      data-slot="store-order"
    >
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-8 md:px-7 md:py-14">
        <div
          className="flex flex-col gap-5 bg-store-contrast p-6 text-store-background md:p-10"
          data-testid="store-order-banner"
        >
          <p className="flex items-center gap-2 text-base font-semibold text-store-accent">
            <CircleCheck aria-hidden="true" className="size-6 shrink-0" />
            {labels.received}
          </p>
          <h1 className="flex flex-col gap-2">
            <span className="text-sm text-store-contrast-muted">
              {labels.code}
            </span>
            <span
              className="font-display store-display-page leading-display font-extrabold uppercase"
              data-testid="store-order-code"
            >
              {order.code}
            </span>
          </h1>
        </div>
        {/* Across, under the banner, on a computer. */}
        <StoreOrderStepper className="hidden md:block" status={order.status} />
        <p className="text-base">
          {interpolate(labels.next, { phone: order.customerPhone })}
        </p>
        <dl className="grid grid-cols-[auto_1fr] items-baseline gap-x-4 border-y border-store-line py-4">
          <dt className={LABEL_CLASS}>{labels.status}</dt>
          <dd data-status={order.status} data-testid="store-order-status">
            {labels.statuses[order.status]}
          </dd>
        </dl>
        <section
          aria-labelledby="store-order-items"
          className="flex flex-col gap-4"
          data-testid="store-order-items"
        >
          <h2
            className="font-display store-display-section leading-display font-extrabold uppercase"
            id="store-order-items"
          >
            {labels.items}
          </h2>
          <ul className="border-t border-store-line">
            {order.items.map((item) => (
              <li
                className="flex items-baseline justify-between gap-4 border-b border-store-line py-3"
                // One line per article in an order, and its texts never
                // change afterwards: they make a stable key.
                key={`${item.title}|${item.quantity}|${item.unitPriceAmount}`}
              >
                <span className="min-w-0 wrap-anywhere">
                  <span className="font-semibold tabular-nums">
                    {item.quantity} ×
                  </span>{" "}
                  {item.title}
                </span>
                <span className="shrink-0 tabular-nums">
                  {formatPrice(
                    item.unitPriceAmount * item.quantity,
                    order.currencyCode,
                    locale
                  )}
                </span>
              </li>
            ))}
          </ul>
          <p
            className="flex items-baseline justify-between gap-4"
            data-testid="store-order-total"
          >
            <span className={LABEL_CLASS}>{labels.total}</span>
            <span className="text-xl font-semibold tabular-nums">
              {formatPrice(order.totalAmount, order.currencyCode, locale)}
            </span>
          </p>
        </section>
        {order.note ? (
          <section className="flex flex-col gap-2">
            <h2 className={LABEL_CLASS}>{labels.note}</h2>
            <p className="whitespace-pre-line">{order.note}</p>
          </section>
        ) : null}
        {/* Down, at the end of the order, on a phone. */}
        <StoreOrderStepper className="md:hidden" status={order.status} />
        <div
          className="flex flex-col items-center gap-3"
          data-testid="store-order-actions"
        >
          {whatsappHref ? (
            <StoreButton asChild size="lg" variant="outline">
              <a href={whatsappHref} rel="noopener noreferrer" target="_blank">
                <MessageCircle aria-hidden="true" />
                {labels.contactStore}
                <span className="sr-only"> {copy.shell.newTab}</span>
              </a>
            </StoreButton>
          ) : null}
          <StoreButton asChild size="lg">
            <Link href={catalogHref}>{labels.keepShopping}</Link>
          </StoreButton>
        </div>
      </div>
      {/* Apart from the order, with room on both sides. */}
      <StoreArticleBand
        className="my-6 md:my-10"
        greeting={copy.article.bandGreeting}
        pauseLabel={copy.article.bandPause}
      />
      {again && again.articles.length > 0 ? (
        <StoreArticleRow
          items={again.articles.map((item) => ({
            content: (
              <StoreArticleCard
                amount={item.priceAmount}
                currency={item.currencyCode}
                headingLevel="h3"
                href={localizePath(articlePath(item.slug), locale)}
                image={
                  item.cover
                    ? { alt: item.cover.alt, src: item.cover.url }
                    : null
                }
                labels={cardLabels}
                locale={locale}
                name={item.title}
                nameLang={item.lang}
                sizes={STORE_CARD_SIZES.row}
                unavailable={!item.isAvailable}
              />
            ),
            id: String(item.id),
          }))}
          title={labels.orderAgain}
          viewAllHref={again.href}
          viewAllOf={again.name}
        />
      ) : null}
    </div>
  );
}

export { StoreOrder };
