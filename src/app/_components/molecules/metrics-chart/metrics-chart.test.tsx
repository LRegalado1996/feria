import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { isValidElement, type ReactNode } from "react";
import { describe, expect, test, vi } from "vitest";

import { renderWithI18n } from "@/test/i18n";

import {
  MetricsChart,
  type MetricsChartProps,
  MetricsTooltip,
} from "./metrics-chart";

// happy-dom lays nothing out, so Recharts would draw nothing: each part is
// a stand-in that records what the chart handed it.
const { parts } = vi.hoisted(() => ({
  parts: vi.fn<(name: string, props: Record<string, unknown>) => void>(),
}));

vi.mock("recharts", () => {
  const part = (name: string) => {
    function RechartsPart({
      children,
      ...props
    }: Record<string, unknown> & { children?: ReactNode }) {
      parts(name, props);

      return <div data-testid={`recharts-${name}`}>{children}</div>;
    }

    return RechartsPart;
  };

  return {
    Bar: part("Bar"),
    BarChart: part("BarChart"),
    CartesianGrid: part("CartesianGrid"),
    Line: part("Line"),
    LineChart: part("LineChart"),
    ResponsiveContainer: part("ResponsiveContainer"),
    Tooltip: part("Tooltip"),
    XAxis: part("XAxis"),
    YAxis: part("YAxis"),
  };
});

function makeProps(
  overrides: Partial<MetricsChartProps> = {}
): MetricsChartProps {
  return {
    column: "Day",
    kind: "bar",
    rows: [
      { label: "Dec 1", values: { orders: 2 } },
      { label: "Dec 2", values: { orders: 1234 } },
    ],
    series: [{ color: 1, key: "orders", label: "Orders" }],
    showData: "Show the data",
    title: "Orders per day",
    value: { kind: "count" },
    ...overrides,
  };
}

/** What the chart handed the stand-in named `name`, each time. */
function propsOf(name: string) {
  return parts.mock.calls
    .filter(([part]) => part === name)
    .map(([, props]) => props);
}

function setup({
  locale = "en",
  ...overrides
}: Partial<MetricsChartProps> & { locale?: "en" | "es" } = {}) {
  renderWithI18n(<MetricsChart {...makeProps(overrides)} />, { locale });

  return {
    figure: screen.getByTestId("metrics-chart"),
    table: () => screen.getByRole("table", { hidden: true }),
    user: userEvent.setup(),
  };
}

describe("MetricsChart", () => {
  test("draws a bar per series in its chart color, with no animation, from the rows", () => {
    setup();

    expect(propsOf("BarChart")).toEqual([
      expect.objectContaining({
        data: [
          { label: "Dec 1", orders: 2 },
          { label: "Dec 2", orders: 1234 },
        ],
      }),
    ]);
    expect(propsOf("Bar")).toEqual([
      expect.objectContaining({
        dataKey: "orders",
        fill: "var(--chart-1)",
        isAnimationActive: false,
        maxBarSize: 32,
        name: "Orders",
      }),
    ]);
    expect(propsOf("Line")).toEqual([]);
  });

  test("draws lines for a line chart, each 2 px in its color, and a legend for two series", () => {
    const { figure } = setup({
      kind: "line",
      rows: [{ label: "Dec 1", values: { views: 5, visits: 3 } }],
      series: [
        { color: 1, key: "visits", label: "Visits" },
        { color: 2, key: "views", label: "Views" },
      ],
    });

    expect(propsOf("Line")).toEqual([
      expect.objectContaining({
        dataKey: "visits",
        isAnimationActive: false,
        stroke: "var(--chart-1)",
        strokeWidth: 2,
      }),
      expect.objectContaining({
        dataKey: "views",
        isAnimationActive: false,
        stroke: "var(--chart-2)",
        strokeWidth: 2,
      }),
    ]);
    expect(
      within(figure)
        .getAllByRole("listitem")
        .map((item) => item.textContent)
    ).toEqual(["Visits", "Views"]);
  });

  test("names the chart, and leaves the legend out for one series", () => {
    const { figure } = setup();

    expect(figure.querySelector("figcaption")).toHaveTextContent(
      /^Orders per day$/u
    );
    expect(within(figure).queryAllByRole("listitem")).toEqual([]);
  });

  test("gives the server a size to draw at, the box's height, until the browser measures it", () => {
    setup();

    expect(propsOf("ResponsiveContainer")).toEqual([
      {
        height: "100%",
        initialDimension: { height: 224, width: 640 },
        width: "100%",
      },
    ]);
  });

  test("keeps the picture from a screen reader, which gets the table", () => {
    const { figure } = setup();

    expect(
      within(figure).getByTestId("recharts-ResponsiveContainer").parentElement
    ).toHaveAttribute("aria-hidden", "true");
  });

  test("shows the exact records under the toggle, numbers in the page's language", async () => {
    const { table, user } = setup({ locale: "es" });

    expect(table()).not.toBeVisible();

    await user.click(screen.getByText("Show the data"));

    expect(table()).toBeVisible();
    expect(
      within(table())
        .getAllByRole("row")
        .map((row) => row.textContent)
    ).toEqual(["DayOrders", "Dec 12", "Dec 21.234"]);
  });

  test("reads a missing value as zero in the table", () => {
    const { table } = setup({
      rows: [{ label: "Dec 1", values: {} }],
    });

    expect(
      within(table()).getAllByRole("row", { hidden: true })[1]
    ).toHaveTextContent(/^Dec 10$/u);
  });

  test.each([
    [{ kind: "count" } as const, 1234, "1,234"],
    [{ currency: "UYU", kind: "price" } as const, 123_450, "UYU\u00A01,234.50"],
  ])("writes the axis's values as %j: %i is %s", (value, tick, text) => {
    setup({ value });

    const [yAxis] = propsOf("YAxis");
    const format = yAxis?.tickFormatter as (tick: number) => string;

    expect(format(tick)).toBe(text);
    expect(yAxis?.width).toBe(value.kind === "price" ? 72 : 40);
  });

  test("hands the tooltip the hovered point to write in the series' words", () => {
    setup();

    const [tooltip] = propsOf("Tooltip");
    const content = tooltip?.content;

    if (!isValidElement<Parameters<typeof MetricsTooltip>[0]>(content)) {
      throw new Error("The tooltip's content is not an element");
    }

    expect(content.type).toBe(MetricsTooltip);

    // What Recharts adds to the element's own props as the cursor moves.
    const { container } = renderWithI18n(
      <MetricsTooltip
        {...content.props}
        active
        label="Dec 2"
        payload={[{ dataKey: "orders", value: 1234 }]}
      />
    );

    expect(container).toHaveTextContent(/^Dec 2Orders1,234$/u);
  });
});

describe("MetricsTooltip", () => {
  const series = [
    { color: 1, key: "visits", label: "Visits" },
    { color: 2, key: "views", label: "Views" },
  ] as const;

  test.each([
    [
      "not hovered",
      { active: false, payload: [{ dataKey: "visits", value: 1 }] },
    ],
    ["hovered with no point", { active: true, payload: [] }],
    ["hovered before Recharts hands a payload", { active: true }],
  ])("draws nothing %s", (_case, props) => {
    const { container } = renderWithI18n(
      <MetricsTooltip
        {...props}
        locale="en"
        series={[...series]}
        value={{ kind: "count" }}
      />
    );

    expect(container).toBeEmptyDOMElement();
  });

  test("writes each series it has a point for, in the series' order, prices in the currency", () => {
    renderWithI18n(
      <MetricsTooltip
        active
        label="Dec 1"
        locale="es"
        payload={[{ dataKey: "views", value: 150_000 }]}
        series={[...series]}
        value={{ currency: "UYU", kind: "price" }}
      />
    );

    expect(screen.getByText("Dec 1").parentElement).toHaveTextContent(
      /^Dec 1Views\$ 1\.500$/u
    );
  });
});
