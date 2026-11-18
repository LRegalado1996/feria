import { ChevronRight, CircleCheck, ImageOff, PencilLine } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import type { Dictionary } from "@/content";
import type { Locale } from "@/lib/i18n/config";
import type { client } from "@/lib/orpc/client";
import { cn } from "@/lib/utils";
import {
  type Currency,
  formatPrice,
  formatRelativeTime,
} from "@/lib/utils/format";

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
  /** The clock the last change's age is read against (`useNow`). */
  now: number;
}

/**
 * The columns of a row from `xl` up, which the list's header shares: the
 * cover, the title, the category, the price, the status, the last change.
 * Below `xl`, beside the sidebar, the fixed ones would leave the title no
 * room (as the orders found): a row is a card there.
 */
export const PRODUCT_ROW_COLUMNS =
  "xl:grid-cols-[3.5rem_minmax(0,1fr)_minmax(0,10rem)_7rem_10rem_9rem]";

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
 * One article of the admin's list (FER-017, FER-019; its quick edits come
 * later in FER-019): its cover, its title (or "Sin título", a blank draft),
 * its category, its price, whether it is a draft or published and whether
 * it can be bought, and how long ago it last changed. A row of the list's
 * table, its cells under the column names from `xl` up and a card below;
 * the title is the one link, stretched over the whole row, so a tap anywhere
 * opens the wizard on it and a screen reader hears one link per article.
 */
function ProductListRow({
  copy,
  currency,
  href,
  item,
  locale,
  now,
}: ProductListRowProps) {
  const published = item.status === "published";
  const category = item.category ? nameIn(item.category, locale) : null;

  return (
    <tr
      className={cn(
        "relative grid grid-cols-[3.5rem_minmax(0,1fr)] items-center gap-x-3 gap-y-1 rounded-lg border bg-card p-3 text-card-foreground transition-colors hover:bg-accent has-[a:focus-visible]:ring-2 has-[a:focus-visible]:ring-ring xl:gap-x-4 xl:rounded-none xl:border-0 xl:bg-transparent xl:px-4 xl:py-2.5 xl:has-[a:focus-visible]:ring-inset",
        PRODUCT_ROW_COLUMNS
      )}
      data-slot="product-list-row"
      data-testid={`product-row-${item.id}`}
    >
      <td className="relative row-span-4 flex size-14 items-center justify-center self-start overflow-hidden rounded-md bg-muted xl:row-span-1 xl:self-center">
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
      </td>
      <td className="min-w-0">
        <Link
          className={cn(
            "block truncate text-base font-medium outline-none after:absolute after:inset-0 after:rounded-lg xl:text-sm xl:after:rounded-none",
            item.title === null && "text-muted-foreground italic"
          )}
          data-testid="product-row-title"
          href={href}
          lang={item.titleLang ?? undefined}
        >
          {item.title ?? copy.untitled}
        </Link>
      </td>
      <td className="col-start-2 min-w-0 truncate text-xs text-muted-foreground xl:col-start-auto xl:text-sm">
        {category ?? copy.noCategory}
      </td>
      <td
        className={cn(
          "col-start-2 text-sm tabular-nums xl:col-start-auto xl:text-right",
          item.priceAmount === null ? "text-muted-foreground" : "font-semibold"
        )}
      >
        {item.priceAmount === null
          ? copy.noPrice
          : formatPrice(item.priceAmount, currency, locale)}
      </td>
      <td className="col-start-2 mt-0.5 flex flex-wrap gap-1.5 xl:col-start-auto xl:mt-0">
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
      </td>
      <td className="hidden items-center justify-between gap-2 text-sm text-muted-foreground xl:flex">
        <time
          data-testid="product-row-updated"
          dateTime={item.updatedAt.toISOString()}
        >
          {formatRelativeTime(item.updatedAt, now, locale)}
        </time>
        <ChevronRight aria-hidden className="size-4 shrink-0" />
      </td>
    </tr>
  );
}

export { ProductListRow };
