import { CircleCheck, MessageCircle } from "lucide-react";
import Link from "next/link";

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
        "mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-8 text-store-foreground md:py-12",
        className
      )}
      data-slot="store-order"
    >
      <div
        className="flex flex-col gap-4 bg-store-contrast p-6 text-store-background"
        data-testid="store-order-banner"
      >
        <p className="flex items-center gap-2 text-lg font-semibold">
          <CircleCheck aria-hidden="true" className="size-6 shrink-0" />
          {labels.received}
        </p>
        <h1 className="flex flex-col gap-1">
          <span className="text-sm font-semibold">{labels.code}</span>
          <span
            className="font-display store-display-section leading-display tracking-display uppercase"
            data-testid="store-order-code"
          >
            {order.code}
          </span>
        </h1>
      </div>
      <p className="text-base">
        {interpolate(labels.next, { phone: order.customerPhone })}
      </p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 border-y-2 border-store-line py-4">
        <dt className="text-sm font-semibold">{labels.status}</dt>
        <dd data-status={order.status} data-testid="store-order-status">
          {labels.statuses[order.status]}
        </dd>
      </dl>
      <section
        aria-labelledby="store-order-items"
        className="flex flex-col gap-3"
      >
        <h2
          className="font-display text-3xl leading-none tracking-display uppercase"
          id="store-order-items"
        >
          {labels.items}
        </h2>
        <ul className="border-t-2 border-store-line">
          {order.items.map((item) => (
            <li
              className="flex items-baseline justify-between gap-4 border-b-2 border-store-line py-3"
              // One line per article in an order, and its texts never
              // change afterwards: they make a stable key.
              key={`${item.title}|${item.quantity}|${item.unitPriceAmount}`}
            >
              <span>
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
          className="flex items-baseline justify-between gap-4 font-display text-3xl leading-none tracking-display uppercase tabular-nums"
          data-testid="store-order-total"
        >
          <span>{labels.total}</span>
          <span>
            {formatPrice(order.totalAmount, order.currencyCode, locale)}
          </span>
        </p>
      </section>
      {order.note ? (
        <section className="flex flex-col gap-1">
          <h2 className="text-sm font-semibold">{labels.note}</h2>
          <p className="whitespace-pre-line">{order.note}</p>
        </section>
      ) : null}
      <div className="flex flex-col gap-3 sm:flex-row">
        {whatsappHref ? (
          <a
            className="inline-flex min-h-12 items-center justify-center gap-2 border-2 border-store-contrast px-5 font-semibold hover:bg-store-contrast hover:text-store-background focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-store-foreground"
            href={whatsappHref}
            rel="noopener noreferrer"
            target="_blank"
          >
            <MessageCircle aria-hidden="true" className="size-5" />
            {labels.contactStore}
            <span className="sr-only"> {newTabLabel}</span>
          </a>
        ) : null}
        <Link
          className="inline-flex min-h-12 items-center justify-center px-5 font-semibold underline underline-offset-4 hover:no-underline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-store-foreground"
          href={catalogHref}
        >
          {labels.keepShopping}
        </Link>
      </div>
    </div>
  );
}

export { StoreOrder };
