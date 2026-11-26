import Link from "next/link";
import type { ReactNode } from "react";

import { AdminPage } from "@/app/_components/molecules/admin-page";
import {
  MetricsChart,
  type MetricsChartRow,
} from "@/app/_components/molecules/metrics-chart";
import type { Dictionary } from "@/content/es";
import { lastDays, type MetricsRange, metricsPath } from "@/lib/admin/metrics";
import { productPath } from "@/lib/admin/products";
import type { Locale } from "@/lib/i18n/config";
import { interpolate } from "@/lib/i18n/interpolate";
import { eachDay } from "@/lib/metrics/days";
import type { client } from "@/lib/orpc/client";
import { DASHBOARD_RANGE_PRESETS } from "@/lib/schemas/metrics";
import { ORDER_STATUSES } from "@/lib/schemas/order";
import { cn } from "@/lib/utils";
import {
  formatCalendarDay,
  formatDate,
  formatDayMonth,
  formatInteger,
  formatPercent,
  formatPrice,
} from "@/lib/utils/format";

/** What the dashboard procedure answers for a range. */
type Dashboard = Awaited<ReturnType<typeof client.metrics.dashboard>>;

export interface MetricsDashboardProps {
  copy: Dictionary["admin"]["metrics"];
  dashboard: Dashboard;
  locale: Locale;
  /** The order statuses' names, as the orders screen says them. */
  statuses: Dictionary["admin"]["orders"]["statuses"];
  range: MetricsRange;
  /** The business day the presets end on. */
  today: string;
}

function Section({
  children,
  testId,
  title,
}: {
  children: ReactNode;
  testId: string;
  title: string;
}) {
  return (
    <section
      aria-labelledby={`${testId}-title`}
      className="grid gap-5 rounded-lg border bg-card p-4 text-card-foreground md:p-5"
      data-testid={testId}
    >
      <h2 className="text-base font-semibold" id={`${testId}-title`}>
        {title}
      </h2>
      {children}
    </section>
  );
}

/** A headline number with its name, and a line under it when it has one. */
function Stat({
  label,
  note,
  testId,
  value,
}: {
  label: string;
  note?: string;
  testId: string;
  value: string;
}) {
  return (
    <div className="grid gap-1" data-testid={testId}>
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-2xl font-semibold tabular-nums">{value}</dd>
      {note ? <dd className="text-xs text-muted-foreground">{note}</dd> : null}
    </div>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}

/** A table of rows under named columns, the numeric ones right-aligned. */
function DataTable({
  caption,
  columns,
  rows,
  testId,
}: {
  caption: string;
  columns: { label: string; numeric?: boolean }[];
  rows: { cells: ReactNode[]; key: string }[];
  testId: string;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm" data-testid={testId}>
        <caption className="mb-2 text-left text-sm font-medium">
          {caption}
        </caption>
        <thead className="text-muted-foreground">
          <tr className="border-b">
            {columns.map((column) => (
              <th
                className={cn(
                  "py-2 font-medium",
                  column.numeric ? "pl-4 text-right" : "pr-4 text-left"
                )}
                key={column.label}
                scope="col"
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr className="border-b last:border-0" key={row.key}>
              {row.cells.map((cell, index) => {
                const column = columns[index];

                return (
                  <td
                    className={cn(
                      "py-2",
                      column?.numeric
                        ? "pl-4 text-right tabular-nums"
                        : "pr-4 text-left"
                    )}
                    // The cells' order is the columns'.
                    // oxlint-disable-next-line react/no-array-index-key -- a row's cells never move (1 here)
                    key={index}
                  >
                    {cell}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * "x of the visits", or nothing when there was none, or when the part
 * outgrows them: orders count every shopper, visits only the browsers the
 * count reached (no bots, no blockers), so past 100% the figure says
 * nothing true.
 */
function shareOf(part: number, whole: number, copy: string, locale: Locale) {
  return whole === 0 || part > whole
    ? undefined
    : interpolate(copy, {
        rate: formatPercent((part / whole) * 100, locale),
      });
}

/**
 * The metrics dashboard (FER-030): a range of business days chosen in the
 * address, then, each in its card, the way from a visit to an order, the
 * visits and views per day, the articles (now, and the range's most viewed
 * with and without orders), the orders (per day, per currency, per status,
 * the most ordered articles) and the panel's use. Every number is the
 * server's; an empty range says so instead of drawing zeros. Amounts are
 * per currency, never added together.
 */
function MetricsDashboard({
  copy,
  dashboard,
  locale,
  range,
  statuses,
  today,
}: MetricsDashboardProps) {
  const { funnel } = dashboard;
  const days = eachDay(range.from, range.to);
  // A range within one year names a day by its day and month; one across
  // two years by its year too, so no two days read alike.
  const dayLabel =
    range.from.slice(0, 4) === range.to.slice(0, 4)
      ? (day: string) => formatDayMonth(day, locale)
      : (day: string) => formatCalendarDay(day, locale);
  const dayRows = <T,>(
    rows: readonly (T & { day: string })[],
    values: (row: T | undefined) => Record<string, number>
  ): MetricsChartRow[] =>
    days.map((day) => ({
      key: day,
      label: dayLabel(day),
      values: values(rows.find((row) => row.day === day)),
    }));
  const ordersPerDay = days.map((day) => ({
    key: day,
    label: dayLabel(day),
    values: {
      orders: dashboard.orders.byDay
        .filter((row) => row.day === day)
        .reduce((total, row) => total + row.orders, 0),
    },
  }));
  const titleOf = (title: string) => title || copy.articles.untitled;
  const articleLink = (productId: number, title: string) => (
    <Link
      className="underline-offset-4 hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
      href={productPath(productId, locale)}
    >
      {titleOf(title)}
    </Link>
  );

  return (
    <AdminPage title={copy.title}>
      <nav
        aria-label={copy.range.label}
        className="flex flex-wrap items-center gap-2"
        data-testid="metrics-range"
      >
        {DASHBOARD_RANGE_PRESETS.map((presetDays) => {
          const preset = lastDays(presetDays, today);
          const current = preset.from === range.from && preset.to === range.to;

          return (
            <Link
              aria-current={current ? "page" : undefined}
              className={cn(
                "inline-flex h-11 items-center rounded-full border px-4 text-sm focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none md:h-8 md:px-3",
                current
                  ? "border-foreground bg-foreground text-background"
                  : "bg-card text-muted-foreground hover:text-foreground"
              )}
              href={metricsPath(locale, preset)}
              key={presetDays}
            >
              {presetDays === 365
                ? copy.range.lastYear
                : interpolate(copy.range.last, { days: presetDays })}
            </Link>
          );
        })}
        <p
          className="text-sm text-muted-foreground"
          data-testid="metrics-range-days"
        >
          {interpolate(copy.range.showing, {
            from: formatCalendarDay(range.from, locale),
            to: formatCalendarDay(range.to, locale),
          })}
        </p>
      </nav>

      <Section testId="metrics-funnel" title={copy.funnel.title}>
        <dl className="grid gap-4 sm:grid-cols-3">
          <Stat
            label={copy.funnel.visits}
            testId="metrics-funnel-visits"
            value={formatInteger(funnel.visits, locale)}
          />
          <Stat
            label={copy.funnel.views}
            testId="metrics-funnel-views"
            value={formatInteger(funnel.views, locale)}
          />
          <Stat
            label={copy.funnel.orders}
            note={shareOf(
              funnel.orders,
              funnel.visits,
              copy.funnel.ofVisits,
              locale
            )}
            testId="metrics-funnel-orders"
            value={formatInteger(funnel.orders, locale)}
          />
        </dl>
      </Section>

      <Section testId="metrics-traffic" title={copy.traffic.section}>
        {dashboard.traffic.length === 0 ? (
          <Empty>{copy.noData}</Empty>
        ) : (
          <MetricsChart
            column={copy.day}
            kind="line"
            rows={dayRows(dashboard.traffic, (row) => ({
              views: row?.views ?? 0,
              visits: row?.visits ?? 0,
            }))}
            series={[
              { color: 1, key: "visits", label: copy.traffic.visits },
              { color: 2, key: "views", label: copy.traffic.views },
            ]}
            showData={copy.showData}
            title={copy.traffic.title}
            value={{ kind: "count" }}
          />
        )}
      </Section>

      <Section testId="metrics-articles" title={copy.articles.title}>
        <dl className="grid gap-4 sm:grid-cols-3">
          <Stat
            label={copy.articles.published}
            testId="metrics-articles-published"
            value={formatInteger(dashboard.catalog.published, locale)}
          />
          <Stat
            label={copy.articles.unavailable}
            testId="metrics-articles-unavailable"
            value={formatInteger(dashboard.catalog.unavailable, locale)}
          />
          <Stat
            label={copy.articles.draft}
            testId="metrics-articles-draft"
            value={formatInteger(dashboard.catalog.draft, locale)}
          />
        </dl>
        {dashboard.topViewed.length === 0 ? (
          <Empty>{copy.articles.noViews}</Empty>
        ) : (
          <>
            <DataTable
              caption={copy.articles.topViewed}
              columns={[
                { label: copy.articles.article },
                { label: copy.articles.views, numeric: true },
                { label: copy.articles.units, numeric: true },
              ]}
              rows={dashboard.topViewed.map((row) => ({
                cells: [
                  articleLink(row.productId, row.title),
                  formatInteger(row.views, locale),
                  formatInteger(row.units, locale),
                ],
                key: String(row.productId),
              }))}
              testId="metrics-top-viewed"
            />
            {dashboard.viewedNotOrdered.length === 0 ? (
              <Empty>{copy.articles.viewedNotOrderedNone}</Empty>
            ) : (
              <div className="grid gap-1">
                <DataTable
                  caption={copy.articles.viewedNotOrdered}
                  columns={[
                    { label: copy.articles.article },
                    { label: copy.articles.views, numeric: true },
                  ]}
                  rows={dashboard.viewedNotOrdered.map((row) => ({
                    cells: [
                      articleLink(row.productId, row.title),
                      formatInteger(row.views, locale),
                    ],
                    key: String(row.productId),
                  }))}
                  testId="metrics-viewed-not-ordered"
                />
                <p className="text-xs text-muted-foreground">
                  {copy.articles.viewedNotOrderedHint}
                </p>
              </div>
            )}
          </>
        )}
      </Section>

      <Section testId="metrics-orders" title={copy.orders.title}>
        {funnel.orders === 0 ? (
          <Empty>{copy.orders.none}</Empty>
        ) : (
          <>
            <MetricsChart
              column={copy.day}
              kind="bar"
              rows={ordersPerDay}
              series={[{ color: 1, key: "orders", label: copy.orders.count }]}
              showData={copy.showData}
              title={copy.orders.perDay}
              value={{ kind: "count" }}
            />
            {dashboard.orders.byCurrency.map((totals) => {
              const title = interpolate(copy.orders.amountPerDay, {
                currency: totals.currencyCode,
              });

              return (
                <MetricsChart
                  column={copy.day}
                  key={totals.currencyCode}
                  kind="bar"
                  rows={dayRows(
                    dashboard.orders.byDay.filter(
                      (row) => row.currencyCode === totals.currencyCode
                    ),
                    (row) => ({ amount: row?.amount ?? 0 })
                  )}
                  series={[
                    { color: 2, key: "amount", label: copy.orders.total },
                  ]}
                  showData={copy.showData}
                  title={title}
                  value={{ currency: totals.currencyCode, kind: "price" }}
                />
              );
            })}
            <DataTable
              caption={copy.orders.byCurrency}
              columns={[
                { label: copy.orders.currency },
                { label: copy.orders.count, numeric: true },
                { label: copy.orders.total, numeric: true },
                { label: copy.orders.average, numeric: true },
              ]}
              rows={dashboard.orders.byCurrency.map((totals) => ({
                cells: [
                  totals.currencyCode,
                  formatInteger(totals.orders, locale),
                  formatPrice(totals.amount, totals.currencyCode, locale),
                  formatPrice(totals.average, totals.currencyCode, locale),
                ],
                key: totals.currencyCode,
              }))}
              testId="metrics-orders-by-currency"
            />
            <div className="grid gap-1">
              <DataTable
                caption={copy.orders.byStatus}
                columns={[
                  { label: copy.orders.status },
                  { label: copy.orders.count, numeric: true },
                  { label: copy.orders.share, numeric: true },
                ]}
                rows={ORDER_STATUSES.map((status) => ({
                  cells: [
                    statuses[status],
                    formatInteger(dashboard.orders.byStatus[status], locale),
                    formatPercent(
                      (dashboard.orders.byStatus[status] / funnel.orders) * 100,
                      locale
                    ),
                  ],
                  key: status,
                }))}
                testId="metrics-orders-by-status"
              />
              {dashboard.orders.undeliverableShare === null ? null : (
                <p
                  className="text-xs text-muted-foreground"
                  data-testid="metrics-undeliverable"
                >
                  {interpolate(copy.orders.undeliverable, {
                    rate: formatPercent(
                      dashboard.orders.undeliverableShare * 100,
                      locale
                    ),
                  })}
                </p>
              )}
            </div>
            <DataTable
              caption={copy.orders.topOrdered}
              columns={[
                { label: copy.articles.article },
                { label: copy.orders.units, numeric: true },
              ]}
              rows={dashboard.topOrdered.map((row) => ({
                cells: [
                  articleLink(row.productId, row.title),
                  formatInteger(row.units, locale),
                ],
                key: String(row.productId),
              }))}
              testId="metrics-top-ordered"
            />
          </>
        )}
      </Section>

      <Section testId="metrics-adoption" title={copy.adoption.title}>
        {dashboard.articlesPerWeek.length === 0 ? (
          <Empty>{copy.noData}</Empty>
        ) : (
          <MetricsChart
            column={copy.adoption.weekColumn}
            kind="bar"
            rows={dashboard.articlesPerWeek.map((row) => ({
              key: row.week,
              // The range's first week is named by the range's first day:
              // its Monday may come before it, and counts nothing before.
              label: interpolate(copy.adoption.week, {
                day: dayLabel(row.week < range.from ? range.from : row.week),
              }),
              values: { created: row.created },
            }))}
            series={[
              { color: 1, key: "created", label: copy.adoption.created },
            ]}
            showData={copy.showData}
            title={copy.adoption.perWeek}
            value={{ kind: "count" }}
          />
        )}
        <DataTable
          caption={copy.adoption.logins}
          columns={[
            { label: copy.adoption.login },
            { label: copy.adoption.lastSignIn },
          ]}
          rows={dashboard.logins.map((login) => ({
            cells: [
              <span className="grid" key="login">
                <span>{login.name}</span>
                <span className="text-xs text-muted-foreground">
                  {login.email}
                </span>
              </span>,
              login.lastSignInAt
                ? formatDate(login.lastSignInAt, locale)
                : copy.adoption.never,
            ],
            key: login.id,
          }))}
          testId="metrics-logins"
        />
      </Section>
    </AdminPage>
  );
}

export { MetricsDashboard };
