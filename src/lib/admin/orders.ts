import { readRowId } from "@/lib/admin/paths";
import type { Locale } from "@/lib/i18n/config";
import { localizePath } from "@/lib/i18n/paths";
import {
  ORDER_SEARCH_MAX_LENGTH,
  ORDER_STATUSES,
  type OrderStatus,
} from "@/lib/schemas/order";
import { readSearchText } from "@/lib/schemas/search";

/** What the orders screen shows: one status or all, and a search. */
export interface OrdersQuery {
  q?: string;
  status?: OrderStatus;
}

type SearchParamValue = string | string[] | undefined;

function firstValue(value: SearchParamValue): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function isOrderStatus(value: string): value is OrderStatus {
  return (ORDER_STATUSES as readonly string[]).includes(value);
}

/**
 * The orders screen's selection from its query string, which anyone can
 * edit: an unknown status is all of them, a blank search is none, and a
 * search longer than the API takes is cut to what it takes, without the
 * U+0000 it refuses (`readSearchText`).
 */
export function readOrdersQuery(
  searchParams: Record<string, SearchParamValue>
): OrdersQuery {
  const status = firstValue(searchParams.status);
  const q = readSearchText(
    firstValue(searchParams.q) ?? null,
    ORDER_SEARCH_MAX_LENGTH
  );

  return {
    ...(q ? { q } : {}),
    ...(status !== undefined && isOrderStatus(status) ? { status } : {}),
  };
}

/** A screen's selection as a query string, `?` included, or "" for none. */
function selectionQuery({ q, status }: OrdersQuery): string {
  const params = new URLSearchParams();

  if (status) {
    params.set("status", status);
  }

  if (q?.trim()) {
    params.set("q", q.trim());
  }

  const query = params.toString();

  return query ? `?${query}` : "";
}

/** The orders screen, with its selection in the query string. */
export function ordersPath(locale: Locale, query: OrdersQuery = {}): string {
  return `${localizePath("/admin/orders", locale)}${selectionQuery(query)}`;
}

/**
 * One order's page in the admin, carrying the list's selection it was opened
 * from, so its way back returns to the same tab and search.
 */
export function orderPath(id: number, locale: Locale, from: OrdersQuery = {}) {
  return `${localizePath(`/admin/orders/${id}`, locale)}${selectionQuery(from)}`;
}

/**
 * An order's id from its page's address, or `null` when the segment cannot
 * be one, so a made-up address costs no query (`readRowId`).
 */
export function readOrderId(segment: string): number | null {
  return readRowId(segment);
}
