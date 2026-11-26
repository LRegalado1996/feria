import { screen, within } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import type { MetricsChartProps } from "@/app/_components/molecules/metrics-chart";
import { DICTIONARIES, renderWithI18n } from "@/test/i18n";

import {
  MetricsDashboard,
  type MetricsDashboardProps,
} from "./metrics-dashboard";

// The chart has its own tests; here it records what the dashboard drew.
const { charts } = vi.hoisted(() => ({
  charts: vi.fn<(props: MetricsChartProps) => void>(),
}));

vi.mock("@/app/_components/molecules/metrics-chart", () => ({
  MetricsChart: (props: MetricsChartProps) => {
    charts(props);

    return <div data-testid="chart">{props.title}</div>;
  },
}));

type Dashboard = MetricsDashboardProps["dashboard"];

/** A store with nothing in the range and nothing in its catalog. */
function makeEmptyDashboard(): Dashboard {
  return {
    articlesPerWeek: [],
    catalog: { draft: 0, published: 0, unavailable: 0 },
    funnel: { orders: 0, views: 0, visits: 0 },
    logins: [],
    orders: {
      byCurrency: [],
      byDay: [],
      byStatus: { delivered: 0, packed: 0, received: 0, undeliverable: 0 },
      undeliverableShare: null,
    },
    topOrdered: [],
    topViewed: [],
    traffic: [],
    viewedNotOrdered: [],
  };
}

/** Three days of a store that sold in pesos and in dollars. */
function makeDashboard(overrides: Partial<Dashboard> = {}): Dashboard {
  return {
    articlesPerWeek: [{ created: 3, week: "2026-11-30" }],
    catalog: { draft: 2, published: 40, unavailable: 1 },
    funnel: { orders: 4, views: 30, visits: 20 },
    logins: [
      {
        email: "ana@example.com",
        id: "u1",
        lastSignInAt: new Date("2026-12-02T15:00:00.000Z"),
        name: "Ana",
      },
      { email: "beto@example.com", id: "u2", lastSignInAt: null, name: "Beto" },
    ],
    orders: {
      byCurrency: [
        { amount: 600_000, average: 200_000, currencyCode: "UYU", orders: 3 },
        { amount: 1500, average: 1500, currencyCode: "USD", orders: 1 },
      ],
      byDay: [
        { amount: 400_000, currencyCode: "UYU", day: "2026-12-01", orders: 2 },
        { amount: 1500, currencyCode: "USD", day: "2026-12-01", orders: 1 },
        { amount: 200_000, currencyCode: "UYU", day: "2026-12-03", orders: 1 },
      ],
      byStatus: { delivered: 1, packed: 0, received: 2, undeliverable: 1 },
      undeliverableShare: 0.25,
    },
    topOrdered: [{ productId: 7, title: "Ring", units: 3 }],
    topViewed: [
      { productId: 7, title: "Ring", units: 3, views: 18 },
      { productId: 9, title: "", units: 0, views: 2 },
    ],
    traffic: [
      { day: "2026-12-01", views: 18, visits: 12 },
      { day: "2026-12-03", views: 12, visits: 8 },
    ],
    viewedNotOrdered: [{ productId: 9, title: "", views: 2 }],
    ...overrides,
  };
}

function setup({
  dashboard = makeDashboard(),
  locale = "en",
  range = { from: "2026-12-01", to: "2026-12-03" },
}: {
  dashboard?: Dashboard;
  locale?: "en" | "es";
  range?: { from: string; to: string };
} = {}) {
  const { admin } = DICTIONARIES[locale];
  renderWithI18n(
    <MetricsDashboard
      copy={admin.metrics}
      dashboard={dashboard}
      locale={locale}
      range={range}
      statuses={admin.orders.statuses}
      today="2026-12-05"
    />,
    { locale }
  );

  return {
    /** The props of the chart titled `title`. */
    chart: (title: string) =>
      charts.mock.calls.find(([props]) => props.title === title)?.[0],
    rows: (testId: string) =>
      within(screen.getByTestId(testId))
        .getAllByRole("row")
        .map((row) => row.textContent),
    section: (testId: string) => screen.getByTestId(testId),
  };
}

describe("MetricsDashboard", () => {
  test("offers the last 7, 30 and 90 days and a year, each ending today, and says the range shown", () => {
    setup({ range: { from: "2026-11-06", to: "2026-12-05" } });

    const range = screen.getByRole("navigation", { name: "Period" });
    expect(
      within(range)
        .getAllByRole("link")
        .map((link) => [
          link.textContent,
          link.getAttribute("href"),
          link.getAttribute("aria-current"),
        ])
    ).toEqual([
      ["7 days", "/en/admin/metrics?from=2026-11-29&to=2026-12-05", null],
      ["30 days", "/en/admin/metrics?from=2026-11-06&to=2026-12-05", "page"],
      ["90 days", "/en/admin/metrics?from=2026-09-07&to=2026-12-05", null],
      ["1 year", "/en/admin/metrics?from=2025-12-06&to=2026-12-05", null],
    ]);
    expect(screen.getByTestId("metrics-range-days")).toHaveTextContent(
      /^From Nov 6, 2026 to Dec 5, 2026$/u
    );
  });

  test("marks no preset for a range of its own", () => {
    setup();

    expect(
      within(screen.getByRole("navigation", { name: "Period" }))
        .getAllByRole("link")
        .map((link) => link.getAttribute("aria-current"))
    ).toEqual([null, null, null, null]);
  });

  test("takes a visit to an order: the counts, and the orders' share of the visits", () => {
    const { section } = setup();

    expect(section("metrics-funnel-visits")).toHaveTextContent(
      /^Store visits20$/u
    );
    expect(section("metrics-funnel-views")).toHaveTextContent(
      /^Article views30$/u
    );
    expect(section("metrics-funnel-orders")).toHaveTextContent(
      /^Orders420% of the visits$/u
    );
  });

  test("gives no share of no visits", () => {
    const { section } = setup({
      dashboard: makeDashboard({ funnel: { orders: 1, views: 0, visits: 0 } }),
    });

    expect(section("metrics-funnel-orders")).toHaveTextContent(/^Orders1$/u);
  });

  test("draws the visits and views of every day of the range, a day with neither as zero", () => {
    const { chart } = setup();

    expect(chart("Visits and views per day")).toEqual({
      column: "Day",
      kind: "line",
      rows: [
        { label: "Dec 1", values: { views: 18, visits: 12 } },
        { label: "Dec 2", values: { views: 0, visits: 0 } },
        { label: "Dec 3", values: { views: 12, visits: 8 } },
      ],
      series: [
        { color: 1, key: "visits", label: "Visits" },
        { color: 2, key: "views", label: "Views" },
      ],
      showData: "Show the data",
      title: "Visits and views per day",
      value: { kind: "count" },
    });
  });

  test("an empty range says so instead of drawing zeros", () => {
    const { section } = setup({ dashboard: makeEmptyDashboard() });

    expect(section("metrics-traffic")).toHaveTextContent(
      /^Store trafficNo data in this period\.$/u
    );
    expect(section("metrics-orders")).toHaveTextContent(
      /^OrdersThere were no orders in this period\.$/u
    );
    expect(within(section("metrics-articles")).queryByRole("table")).toBeNull();
    expect(section("metrics-articles")).toHaveTextContent(
      "No article was viewed in this period."
    );
    expect(charts).not.toHaveBeenCalled();
  });

  test("counts the articles now, and ranks the range's most viewed with their units, each a link to its article", () => {
    const { rows, section } = setup();

    expect(section("metrics-articles-published")).toHaveTextContent(
      /^Published and for sale40$/u
    );
    expect(section("metrics-articles-unavailable")).toHaveTextContent(
      /^Published, out of stock1$/u
    );
    expect(section("metrics-articles-draft")).toHaveTextContent(/^Drafts2$/u);
    expect(rows("metrics-top-viewed")).toEqual([
      "ArticleViewsUnits ordered",
      "Ring183",
      "Untitled20",
    ]);
    expect(
      within(screen.getByTestId("metrics-top-viewed"))
        .getAllByRole("link")
        .map((link) => link.getAttribute("href"))
    ).toEqual(["/en/admin/products/7", "/en/admin/products/9"]);
    expect(rows("metrics-viewed-not-ordered")).toEqual([
      "ArticleViews",
      "Untitled2",
    ]);
  });

  test("says when every viewed article was ordered", () => {
    const { section } = setup({
      dashboard: makeDashboard({ viewedNotOrdered: [] }),
    });

    expect(section("metrics-articles")).toHaveTextContent(
      "Every viewed article has at least one order in this period."
    );
    expect(screen.queryByTestId("metrics-viewed-not-ordered")).toBeNull();
  });

  test("draws the orders per day across currencies, and each currency's amount apart", () => {
    const { chart } = setup();

    expect(chart("Orders per day")?.rows).toEqual([
      { label: "Dec 1", values: { orders: 3 } },
      { label: "Dec 2", values: { orders: 0 } },
      { label: "Dec 3", values: { orders: 1 } },
    ]);
    expect(chart("Amount per day in UYU")).toMatchObject({
      rows: [
        { label: "Dec 1", values: { amount: 400_000 } },
        { label: "Dec 2", values: { amount: 0 } },
        { label: "Dec 3", values: { amount: 200_000 } },
      ],
      value: { currency: "UYU", kind: "price" },
    });
    expect(chart("Amount per day in USD")).toMatchObject({
      rows: [
        { label: "Dec 1", values: { amount: 1500 } },
        { label: "Dec 2", values: { amount: 0 } },
        { label: "Dec 3", values: { amount: 0 } },
      ],
      value: { currency: "USD", kind: "price" },
    });
  });

  test("totals each currency on its own, splits the orders by status and says how many could not be delivered", () => {
    const { rows, section } = setup();

    expect(rows("metrics-orders-by-currency")).toEqual([
      "CurrencyOrdersTotalAverage order",
      "UYU3UYU 6,000UYU 2,000",
      "USD1USD 15USD 15",
    ]);
    expect(rows("metrics-orders-by-status")).toEqual([
      "StatusOrdersOf all",
      "Received250%",
      "Packed00%",
      "Delivered125%",
      "Couldn't deliver125%",
    ]);
    expect(section("metrics-undeliverable")).toHaveTextContent(
      /^Could not be delivered: 25%$/u
    );
    expect(rows("metrics-top-ordered")).toEqual(["ArticleUnits", "Ring3"]);
  });

  test("leaves the undelivered line out with no rate", () => {
    setup({
      dashboard: makeDashboard({
        orders: { ...makeDashboard().orders, undeliverableShare: null },
      }),
    });

    expect(screen.queryByTestId("metrics-undeliverable")).toBeNull();
  });

  test("draws the articles created per week, and dates each login's last sign-in", () => {
    const { chart, rows } = setup();

    expect(chart("Articles created per week")).toMatchObject({
      kind: "bar",
      rows: [{ label: "Week of Nov 30", values: { created: 3 } }],
    });
    expect(rows("metrics-logins")).toEqual([
      "UserLast sign-in",
      "Anaana@example.comDecember 2, 2026",
      "Betobeto@example.comNever",
    ]);
  });

  test("in Spanish, says the panel's use is empty and names the range in its words", () => {
    const { section } = setup({
      dashboard: makeDashboard({ articlesPerWeek: [] }),
      locale: "es",
    });

    expect(section("metrics-adoption")).toHaveTextContent(
      /^Uso del panelSin datos en este período\./u
    );
    expect(screen.getByTestId("metrics-range-days")).toHaveTextContent(
      /^Del 1 dic\. 2026 al 3 dic\. 2026$/u
    );
    expect(section("metrics-funnel-orders")).toHaveTextContent(
      /^Pedidos420\s?% de las visitas$/u
    );
  });
});
