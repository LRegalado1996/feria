import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  max,
  notExists,
  type SQL,
  sql,
  sum,
} from "drizzle-orm";

import type { Locale } from "@/lib/i18n/config";
import { pickTranslation } from "@/lib/i18n/pick-translation";
import { eachDay } from "@/lib/metrics/days";
import { DASHBOARD_TOP_LIMIT } from "@/lib/schemas/metrics";
import type { OrderStatus } from "@/lib/schemas/order";
import { APP_TIME_ZONE } from "@/lib/utils/format";
import type { DatabaseClient } from "@/server/db";
import {
  currencyCodeEnum,
  customerOrder,
  orderItem,
  product,
  productTranslation,
  productViewDaily,
  session,
  storeVisitDaily,
  user,
} from "@/server/db/schema";

interface DashboardScope {
  /** The range's first and last business days, both included. */
  from: string;
  /** The language each article's title comes in. */
  locale: Locale;
  storeId: number;
  to: string;
}

// A constant of the code, never input: written into the SQL so a grouped
// expression is the same text in the select and the group by (a bound
// parameter there would be two parameters, and two expressions).
const ZONE = sql.raw(`'${APP_TIME_ZONE}'`);

/** Midnight of `day` in the business time zone, as an instant. */
function startOf(day: string): SQL {
  return sql`((${day}::date)::timestamp at time zone ${ZONE})`;
}

/**
 * `column` (an instant) falls on one of the range's business days. The
 * bare column on one side keeps the predicate sargable
 * (docs/agents/database.md § Query habits).
 */
function withinRange(
  column: typeof customerOrder.createdAt | typeof product.createdAt,
  { from, to }: Pick<DashboardScope, "from" | "to">
): SQL | undefined {
  return and(
    gte(column, startOf(from)),
    lt(column, sql`(${startOf(to)} + interval '1 day')`)
  );
}

function ordersInRange(scope: DashboardScope): SQL | undefined {
  return and(
    eq(customerOrder.storeId, scope.storeId),
    withinRange(customerOrder.createdAt, scope)
  );
}

function viewsInRange(scope: DashboardScope): SQL | undefined {
  return and(
    eq(productViewDaily.storeId, scope.storeId),
    gte(productViewDaily.day, scope.from),
    lte(productViewDaily.day, scope.to)
  );
}

const viewTotal = sum(productViewDaily.viewCount).mapWith(Number);
const unitTotal = sum(orderItem.quantity).mapWith(Number);

/** Each article's title in `locale`, else its other language's. */
async function titlesOf(
  tx: DatabaseClient,
  productIds: readonly number[],
  locale: Locale
): Promise<Map<number, string>> {
  if (productIds.length === 0) {
    return new Map();
  }

  const rows = await tx
    .select({
      locale: productTranslation.locale,
      productId: productTranslation.productId,
      title: productTranslation.title,
    })
    .from(productTranslation)
    .where(inArray(productTranslation.productId, [...productIds]));

  return new Map(
    productIds.map((id) => [
      id,
      pickTranslation(
        rows.filter((row) => row.productId === id),
        locale
      )?.title ?? "",
    ])
  );
}

/** An article's title now, else the one an order copied when placed. */
function titleOrCopied(current: string | undefined, copied: string | null) {
  return current !== undefined && current !== "" ? current : (copied ?? "");
}

/** How many units of each article the range's orders hold. */
async function unitsOf(
  tx: DatabaseClient,
  productIds: readonly number[],
  scope: DashboardScope
): Promise<Map<number, number>> {
  if (productIds.length === 0) {
    return new Map();
  }

  const rows = await tx
    .select({ productId: orderItem.productId, units: unitTotal })
    .from(orderItem)
    .innerJoin(customerOrder, eq(orderItem.orderId, customerOrder.id))
    .where(
      and(ordersInRange(scope), inArray(orderItem.productId, [...productIds]))
    )
    .groupBy(orderItem.productId);

  return new Map(
    rows.flatMap((row) =>
      row.productId === null ? [] : [[row.productId, row.units] as const]
    )
  );
}

/** The range's views and visits, each day that has either. */
async function readTraffic(tx: DatabaseClient, scope: DashboardScope) {
  const views = await tx
    .select({ day: productViewDaily.day, views: viewTotal })
    .from(productViewDaily)
    .where(viewsInRange(scope))
    .groupBy(productViewDaily.day)
    .orderBy(asc(productViewDaily.day));
  const visits = await tx
    .select({ day: storeVisitDaily.day, visits: storeVisitDaily.visitCount })
    .from(storeVisitDaily)
    .where(
      and(
        eq(storeVisitDaily.storeId, scope.storeId),
        gte(storeVisitDaily.day, scope.from),
        lte(storeVisitDaily.day, scope.to)
      )
    )
    .orderBy(asc(storeVisitDaily.day));
  const days = new Map<string, { views: number; visits: number }>();

  for (const row of views) {
    days.set(row.day, { views: row.views, visits: 0 });
  }

  for (const row of visits) {
    days.set(row.day, {
      views: days.get(row.day)?.views ?? 0,
      visits: row.visits,
    });
  }

  // In the range's order: each day that has a count, once.
  return eachDay(scope.from, scope.to).flatMap((day) => {
    const totals = days.get(day);

    return totals ? [{ day, ...totals }] : [];
  });
}

/**
 * The range's most viewed articles, and the most viewed among those no
 * order of the range holds.
 */
async function readViewedArticles(tx: DatabaseClient, scope: DashboardScope) {
  const ranking = [desc(sql`sum(${productViewDaily.viewCount})`)];
  // An order of the range holding the article the outer row counts.
  const orderedInRange = tx
    .select({ one: sql`1` })
    .from(orderItem)
    .innerJoin(customerOrder, eq(orderItem.orderId, customerOrder.id))
    .where(
      and(
        eq(orderItem.productId, productViewDaily.productId),
        ordersInRange(scope)
      )
    );
  const topViewed = await tx
    .select({ productId: productViewDaily.productId, views: viewTotal })
    .from(productViewDaily)
    .where(viewsInRange(scope))
    .groupBy(productViewDaily.productId)
    .orderBy(...ranking, asc(productViewDaily.productId))
    .limit(DASHBOARD_TOP_LIMIT);
  const unordered = await tx
    .select({ productId: productViewDaily.productId, views: viewTotal })
    .from(productViewDaily)
    .where(and(viewsInRange(scope), notExists(orderedInRange)))
    .groupBy(productViewDaily.productId)
    .orderBy(...ranking, asc(productViewDaily.productId))
    .limit(DASHBOARD_TOP_LIMIT);

  return { topViewed, unordered };
}

/** The range's orders by day and currency, and by status. */
async function readOrders(tx: DatabaseClient, scope: DashboardScope) {
  const day = sql<string>`((${customerOrder.createdAt} at time zone ${ZONE})::date)::text`;
  const byDay = await tx
    .select({
      amount: sum(customerOrder.totalAmount).mapWith(Number),
      currencyCode: customerOrder.currencyCode,
      day,
      orders: count(),
    })
    .from(customerOrder)
    .where(ordersInRange(scope))
    .groupBy(day, customerOrder.currencyCode)
    .orderBy(asc(day), asc(customerOrder.currencyCode));
  const byStatus = await tx
    .select({ orders: count(), status: customerOrder.status })
    .from(customerOrder)
    .where(ordersInRange(scope))
    .groupBy(customerOrder.status);
  const topOrdered = await tx
    .select({
      productId: orderItem.productId,
      title: max(orderItem.title),
      units: unitTotal,
    })
    .from(orderItem)
    .innerJoin(customerOrder, eq(orderItem.orderId, customerOrder.id))
    .where(and(ordersInRange(scope), isNotNull(orderItem.productId)))
    .groupBy(orderItem.productId)
    .orderBy(desc(sql`sum(${orderItem.quantity})`), asc(orderItem.productId))
    .limit(DASHBOARD_TOP_LIMIT);

  return { byDay, byStatus, topOrdered };
}

/** The store's articles now: published and on sale, unavailable, drafts. */
async function readCatalog(tx: DatabaseClient, scope: DashboardScope) {
  const rows = await tx
    .select({
      articles: count(),
      isAvailable: product.isAvailable,
      status: product.status,
    })
    .from(product)
    .where(eq(product.storeId, scope.storeId))
    .groupBy(product.status, product.isAvailable);
  const total = (match: (row: (typeof rows)[number]) => boolean) =>
    rows.filter(match).reduce((sum, row) => sum + row.articles, 0);

  return {
    draft: total((row) => row.status === "draft"),
    published: total((row) => row.status === "published" && row.isAvailable),
    unavailable: total((row) => row.status === "published" && !row.isAvailable),
  };
}

/** Articles created in each week of the range, weeks from Monday. */
async function readArticlesPerWeek(tx: DatabaseClient, scope: DashboardScope) {
  const week = sql<string>`(date_trunc('week', ${product.createdAt} at time zone ${ZONE})::date)::text`;

  return await tx
    .select({ created: count(), week })
    .from(product)
    .where(
      and(
        eq(product.storeId, scope.storeId),
        withinRange(product.createdAt, scope)
      )
    )
    .groupBy(week)
    .orderBy(asc(week));
}

/**
 * Every enabled login and when it last signed in: its newest session still
 * kept. Better Auth deletes a session at sign-out (and an expired one in
 * time), so a login that signed out reads an older date or none (Lucas,
 * FER-030). A disabled login (FER-015) is left out: it cannot sign in, and
 * disabling it ended its sessions.
 */
async function readLogins(tx: DatabaseClient) {
  const lastSignInAt = max(session.createdAt);

  return await tx
    .select({
      email: user.email,
      id: user.id,
      lastSignInAt,
      name: user.name,
    })
    .from(user)
    .leftJoin(session, eq(session.userId, user.id))
    .where(isNull(user.disabledAt))
    .groupBy(user.id)
    .orderBy(sql`${lastSignInAt} desc nulls last`, asc(user.id));
}

/**
 * What the metrics dashboard shows for a range (FER-030), every number an
 * aggregate of the store's own rows, read in one read-only snapshot so the
 * funnel, the charts and the tables agree. Amounts stay per currency: an
 * order keeps the one it was placed in, and they are never added together.
 * An article deleted since leaves the view counts with it (they cascade);
 * its order lines keep their copied title but no article, so it drops out
 * of the top ordered.
 */
export async function getDashboard(db: DatabaseClient, scope: DashboardScope) {
  return await db.transaction(
    async (tx) => {
      const traffic = await readTraffic(tx, scope);
      const { topViewed, unordered } = await readViewedArticles(tx, scope);
      const orders = await readOrders(tx, scope);
      const catalog = await readCatalog(tx, scope);
      const articlesPerWeek = await readArticlesPerWeek(tx, scope);
      const logins = await readLogins(tx);
      const articleIds = [
        ...new Set([
          ...topViewed.map((row) => row.productId),
          ...unordered.map((row) => row.productId),
          ...orders.topOrdered.flatMap((row) =>
            row.productId === null ? [] : [row.productId]
          ),
        ]),
      ];
      const titles = await titlesOf(tx, articleIds, scope.locale);
      const units = await unitsOf(
        tx,
        topViewed.map((row) => row.productId),
        scope
      );
      const ordersIn = (status: OrderStatus) =>
        orders.byStatus.find((row) => row.status === status)?.orders ?? 0;
      const byStatus = {
        delivered: ordersIn("delivered"),
        packed: ordersIn("packed"),
        received: ordersIn("received"),
        undeliverable: ordersIn("undeliverable"),
      } satisfies Record<OrderStatus, number>;
      const orderCount = orders.byStatus.reduce(
        (total, row) => total + row.orders,
        0
      );
      const currencies = currencyCodeEnum.enumValues.filter((code) =>
        orders.byDay.some((row) => row.currencyCode === code)
      );

      return {
        articlesPerWeek,
        catalog,
        funnel: {
          orders: orderCount,
          views: traffic.reduce((total, row) => total + row.views, 0),
          visits: traffic.reduce((total, row) => total + row.visits, 0),
        },
        logins,
        orders: {
          byCurrency: currencies.map((currencyCode) => {
            const days = orders.byDay.filter(
              (row) => row.currencyCode === currencyCode
            );
            const placed = days.reduce((total, row) => total + row.orders, 0);
            const amount = days.reduce((total, row) => total + row.amount, 0);

            // Rounded once, here, for display: the totals stay exact.
            return {
              amount,
              average: Math.round(amount / placed),
              currencyCode,
              orders: placed,
            };
          }),
          byDay: orders.byDay,
          byStatus,
          // `null` with no order: a rate of nothing is no rate, not 0%.
          undeliverableShare:
            orderCount === 0 ? null : byStatus.undeliverable / orderCount,
        },
        topOrdered: orders.topOrdered.flatMap((row) =>
          row.productId === null
            ? []
            : [
                {
                  productId: row.productId,
                  title: titleOrCopied(titles.get(row.productId), row.title),
                  units: row.units,
                },
              ]
        ),
        topViewed: topViewed.map((row) => ({
          productId: row.productId,
          title: titles.get(row.productId) ?? "",
          units: units.get(row.productId) ?? 0,
          views: row.views,
        })),
        traffic,
        viewedNotOrdered: unordered.map((row) => ({
          productId: row.productId,
          title: titles.get(row.productId) ?? "",
          views: row.views,
        })),
      };
    },
    { accessMode: "read only", isolationLevel: "repeatable read" }
  );
}

export type Dashboard = Awaited<ReturnType<typeof getDashboard>>;
