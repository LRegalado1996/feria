import { CircleCheck, MessageCircle } from "lucide-react";
import Link from "next/link";

import { StoreButton } from "@/app/_components/atoms/store-button";
import type { Dictionary } from "@/content";
import type { Locale } from "@/lib/i18n/config";
import { interpolate } from "@/lib/i18n/interpolate";
import type { OrderStatus } from "@/lib/schemas/order";
import { cn } from "@/lib/utils";
import { type Currency, formatPrice } from "@/lib/utils/format";

export interface StoreOrderProps {
  /** Where to keep browsing: the store's catalog. */
  catalogHref: string;
  className?: string;
  /** Its words, from `getDictionary` on the server. */
  labels: Dictionary["storefront"]["order"];
  locale: Locale;
  /** Said after a link that opens another tab. */
  newTabLabel: string;
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
 * A placed order's page (FER-026): that it was received, the code to say at
 * the stall, what was ordered and for how much, what happens next and where
 * the order is now, so the link stays worth keeping. WhatsApp is a
 * convenience: the store reads the order in its admin either way.
 */
function StoreOrder({
  catalogHref,
  className,
  labels,
  locale,
  newTabLabel,
  order,
  whatsappHref,
}: StoreOrderProps) {
  return (
    <div
      className={cn(
        "mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-8 text-store-foreground md:px-7 md:py-14",
        className
      )}
      data-slot="store-order"
    >
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
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        {whatsappHref ? (
          <StoreButton asChild size="lg" variant="outline">
            <a href={whatsappHref} rel="noopener noreferrer" target="_blank">
              <MessageCircle aria-hidden="true" />
              {labels.contactStore}
              <span className="sr-only"> {newTabLabel}</span>
            </a>
          </StoreButton>
        ) : null}
        <StoreButton asChild size="lg">
          <Link href={catalogHref}>{labels.keepShopping}</Link>
        </StoreButton>
      </div>
    </div>
  );
}

export { StoreOrder };
