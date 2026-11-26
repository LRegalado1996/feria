"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { useLocale } from "@/lib/hooks/i18n";
import type { Locale } from "@/lib/i18n/config";
import { cn } from "@/lib/utils";
import { type Currency, formatInteger, formatPrice } from "@/lib/utils/format";

/** One measure the chart draws, in one of the theme's chart colors. */
export interface MetricsChartSeries {
  /** `--chart-<color>`: the series' place in the fixed order. */
  color: 1 | 2 | 3 | 4 | 5;
  key: string;
  label: string;
}

/**
 * One point along the axis: a key unique in the chart (the day), its label
 * as shown, and each series' value.
 */
export interface MetricsChartRow {
  key: string;
  label: string;
  values: Record<string, number>;
}

/** How the values read: whole counts, or an amount in minor units. */
export type MetricsChartValue =
  | { kind: "count" }
  | { currency: Currency; kind: "price" };

export interface MetricsChartProps {
  className?: string;
  /** The axis's name, the table's first column. */
  column: string;
  kind: "bar" | "line";
  rows: MetricsChartRow[];
  series: MetricsChartSeries[];
  /** The toggle that shows the exact records. */
  showData: string;
  title: string;
  value: MetricsChartValue;
}

const AXIS_TICK = { fill: "var(--muted-foreground)", fontSize: 12 };
/** The chart box's size before the browser measures it: `h-56` tall. */
const INITIAL_SIZE = { height: 224, width: 640 };

function formatValue(
  amount: number,
  value: MetricsChartValue,
  locale: Locale
): string {
  return value.kind === "price"
    ? formatPrice(amount, value.currency, locale)
    : formatInteger(amount, locale);
}

/** The hovered point: its label, then each series' value beside its color. */
function MetricsTooltip({
  active,
  label,
  payload,
  locale,
  series,
  value,
}: {
  active?: boolean;
  label?: number | string;
  locale: Locale;
  /** What Recharts hands its tooltip: each series' point under the cursor. */
  payload?: readonly { dataKey?: unknown; value?: unknown }[];
  series: MetricsChartSeries[];
  value: MetricsChartValue;
}) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  return (
    <div className="grid min-w-32 gap-1.5 rounded-lg border bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-sm">
      <p className="font-medium">{label}</p>
      {series.map((item) => {
        const entry = payload.find((point) => point.dataKey === item.key);

        return entry ? (
          <p className="flex items-center gap-2" key={item.key}>
            <span
              aria-hidden="true"
              className="size-2.5 shrink-0 rounded-[2px]"
              style={{ backgroundColor: `var(--chart-${item.color})` }}
            />
            <span className="text-muted-foreground">{item.label}</span>
            <span className="ml-auto font-medium tabular-nums">
              {formatValue(Number(entry.value), value, locale)}
            </span>
          </p>
        ) : null;
      })}
    </div>
  );
}

/**
 * A metric over time on the dashboard (FER-030): bars or lines in the
 * theme's chart colors, one axis, a legend once there are two series, a
 * tooltip on hover, no animation, and the exact records in a table under a
 * toggle. The chart is a picture of the table, so a screen reader is
 * pointed to the table instead.
 */
function MetricsChart({
  className,
  column,
  kind,
  rows,
  series,
  showData,
  title,
  value,
}: MetricsChartProps) {
  const locale = useLocale();
  const data = rows.map((row) => ({ label: row.label, ...row.values }));
  const Chart = kind === "bar" ? BarChart : LineChart;

  return (
    <figure
      className={cn("grid gap-3", className)}
      data-slot="metrics-chart"
      data-testid="metrics-chart"
    >
      <figcaption className="text-sm font-medium">{title}</figcaption>
      {series.length > 1 ? (
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {series.map((item) => (
            <li className="flex items-center gap-1.5" key={item.key}>
              <span
                aria-hidden="true"
                className="size-2.5 rounded-[2px]"
                style={{ backgroundColor: `var(--chart-${item.color})` }}
              />
              {item.label}
            </li>
          ))}
        </ul>
      ) : null}
      <div aria-hidden="true" className="h-56">
        {/* The server knows no size: it draws at this one until the
            browser measures the box. */}
        <ResponsiveContainer
          height="100%"
          initialDimension={INITIAL_SIZE}
          width="100%"
        >
          <Chart
            // The picture is hidden from assistive technology, so it must
            // not take a keyboard stop either: the table is the way in.
            accessibilityLayer={false}
            data={data}
            margin={{ bottom: 0, left: 0, right: 8, top: 8 }}
          >
            <CartesianGrid stroke="var(--border)" vertical={false} />
            <XAxis
              axisLine={false}
              dataKey="label"
              minTickGap={16}
              tick={AXIS_TICK}
              tickLine={false}
            />
            <YAxis
              allowDecimals={false}
              axisLine={false}
              tick={AXIS_TICK}
              tickFormatter={(tick: number) => formatValue(tick, value, locale)}
              tickLine={false}
              width={value.kind === "price" ? 72 : 40}
            />
            <Tooltip
              // Recharts hands the element the hovered point.
              content={
                <MetricsTooltip locale={locale} series={series} value={value} />
              }
              cursor={{ fill: "var(--muted)", stroke: "var(--border)" }}
              isAnimationActive={false}
            />
            {series.map((item) =>
              kind === "bar" ? (
                <Bar
                  dataKey={item.key}
                  fill={`var(--chart-${item.color})`}
                  isAnimationActive={false}
                  key={item.key}
                  // Thin marks, however few the points.
                  maxBarSize={32}
                  name={item.label}
                  radius={[4, 4, 0, 0]}
                />
              ) : (
                <Line
                  activeDot={{ r: 4 }}
                  dataKey={item.key}
                  dot={false}
                  isAnimationActive={false}
                  key={item.key}
                  name={item.label}
                  stroke={`var(--chart-${item.color})`}
                  strokeWidth={2}
                  type="monotone"
                />
              )
            )}
          </Chart>
        </ResponsiveContainer>
      </div>
      <details className="text-sm">
        <summary className="inline-flex min-h-11 cursor-pointer items-center text-muted-foreground underline-offset-4 hover:underline md:min-h-0">
          {showData}
        </summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">{title}</caption>
            <thead className="text-muted-foreground">
              <tr className="border-b">
                <th className="py-2 pr-4 text-left font-medium" scope="col">
                  {column}
                </th>
                {series.map((item) => (
                  <th
                    className="py-2 pl-4 text-right font-medium"
                    key={item.key}
                    scope="col"
                  >
                    {item.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr className="border-b last:border-0" key={row.key}>
                  <th className="py-2 pr-4 text-left font-normal" scope="row">
                    {row.label}
                  </th>
                  {series.map((item) => (
                    <td
                      className="py-2 pl-4 text-right tabular-nums"
                      key={item.key}
                    >
                      {formatValue(row.values[item.key] ?? 0, value, locale)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}

export { MetricsChart, MetricsTooltip };
