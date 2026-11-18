import { ChevronRight, CircleCheck, ImageOff, PencilLine } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import type { Dictionary } from "@/content";
import type { Locale } from "@/lib/i18n/config";
import type { client } from "@/lib/orpc/client";
import { cn } from "@/lib/utils";
import { type Currency, formatPrice } from "@/lib/utils/format";

/** An article as the admin's list has it (`product.list`). */
export type ProductListItem = Awaited<
  ReturnType<typeof client.product.list>
>["items"][number];

export interface ProductListRowProps {
  copy: Dictionary["articles"]["list"];
  currency: Currency;
  /** The wizard on this article, built by the caller. */
  href: string;
  item: ProductListItem;
  locale: Locale;
}

/**
 * The columns of a row from `md` up, which the list's header shares: the
 * cover, the title, the category, the price, the status.
 */
export const PRODUCT_ROW_COLUMNS =
  "md:grid-cols-[3.5rem_minmax(0,1fr)_minmax(0,10rem)_7rem_9rem_1rem]";

/** A category's name in the page's language, else the Spanish one. */
function nameIn(
  category: { nameEn: string | null; nameEs: string },
  locale: Locale
): string {
  return locale === "en"
    ? (category.nameEn ?? category.nameEs)
    : category.nameEs;
}

/**
 * One article of the admin's list (FER-017; FER-019 adds its quick edits):
 * its cover, its title (or "Sin título", a blank draft), its category, its
 * price, whether it is a draft or published and whether it can be bought.
 * The whole row is one link to the wizard on it. A card on a phone; a row
 * under the list's column names from `md` up.
 */
function ProductListRow({
  copy,
  currency,
  href,
  item,
  locale,
}: ProductListRowProps) {
  const published = item.status === "published";
  const category = item.category ? nameIn(item.category, locale) : null;

  return (
    <li data-slot="product-list-row" data-testid={`product-row-${item.id}`}>
      <Link
        className={cn(
          "grid grid-cols-[3.5rem_minmax(0,1fr)] items-center gap-x-3 gap-y-1 rounded-lg border bg-card p-3 text-card-foreground transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset md:gap-x-4 md:rounded-none md:border-0 md:bg-transparent md:px-4 md:py-2.5",
          PRODUCT_ROW_COLUMNS
        )}
        href={href}
      >
        <span className="relative row-span-4 flex size-14 items-center justify-center self-start overflow-hidden rounded-md bg-muted md:row-span-1 md:self-center">
          {item.cover ? (
            <Image
              alt=""
              className="object-contain"
              fill
              sizes="3.5rem"
              src={item.cover.url}
            />
          ) : (
            <>
              <ImageOff aria-hidden className="size-5 text-muted-foreground" />
              <span className="sr-only">{copy.noPhoto}</span>
            </>
          )}
        </span>
        <span
          className={cn(
            "min-w-0 truncate text-base font-medium md:text-sm",
            item.title === null && "text-muted-foreground italic"
          )}
          data-testid="product-row-title"
          lang={item.titleLang ?? undefined}
        >
          {item.title ?? copy.untitled}
        </span>
        <span className="col-start-2 min-w-0 truncate text-xs text-muted-foreground md:col-start-auto md:text-sm">
          {category ?? copy.noCategory}
        </span>
        <span
          className={cn(
            "col-start-2 text-sm tabular-nums md:col-start-auto md:text-right",
            item.priceAmount === null
              ? "text-muted-foreground"
              : "font-semibold"
          )}
        >
          {item.priceAmount === null
            ? copy.noPrice
            : formatPrice(item.priceAmount, currency, locale)}
        </span>
        <span className="col-start-2 mt-0.5 flex flex-wrap gap-1.5 md:col-start-auto md:mt-0">
          <span
            className={cn(
              "inline-flex h-6 items-center gap-1 rounded-full px-2.5 text-xs font-medium",
              published
                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
            )}
            data-testid="product-row-status"
          >
            {published ? (
              <CircleCheck aria-hidden className="size-3.5" />
            ) : (
              <PencilLine aria-hidden className="size-3.5" />
            )}
            {copy.status[item.status]}
          </span>
          {item.isAvailable ? null : (
            <span
              className="inline-flex h-6 items-center rounded-full bg-muted px-2.5 text-xs font-medium text-muted-foreground"
              data-testid="product-row-unavailable"
            >
              {copy.availability.unavailable}
            </span>
          )}
        </span>
        <ChevronRight
          aria-hidden
          className="hidden size-4 text-muted-foreground md:block"
        />
      </Link>
    </li>
  );
}

export { ProductListRow };
