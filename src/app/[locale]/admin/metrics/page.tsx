import { connection } from "next/server";
import { Suspense } from "react";

import { AdminShellSkeleton } from "@/app/_components/molecules/admin-shell-skeleton";
import { AdminShell } from "@/app/_components/organisms/admin-shell";
import { MetricsDashboard } from "@/app/_components/organisms/metrics-dashboard";
import { getDictionary } from "@/content";
import { requireAdmin } from "@/lib/admin/access";
import { metricsPath, readMetricsRange } from "@/lib/admin/metrics";
import { readLocale } from "@/lib/i18n/read-locale";
import { caller } from "@/lib/orpc/server";
import { businessDay } from "@/lib/utils/format";

interface MetricsPageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** Today in Montevideo: reading the clock is request-time IO. */
async function readToday() {
  await connection();
  return businessDay(new Date());
}

/**
 * The store's metrics (FER-030), behind the admin's per-page check: a
 * session. The range is the query string, the last 30 days when it names
 * none; everything is read on the server, in one snapshot, before the
 * screen renders, so the funnel, the charts and the tables agree.
 */
export default function MetricsPage({
  params,
  searchParams,
}: MetricsPageProps) {
  // The session and the range are only known per request: read inside the
  // boundary, never above it.
  return (
    <Suspense fallback={<AdminShellSkeleton />}>
      <MetricsResolver params={params} searchParams={searchParams} />
    </Suspense>
  );
}

export async function MetricsResolver({
  params,
  searchParams,
}: MetricsPageProps) {
  const locale = await readLocale(params);
  const today = await readToday();
  const search = await searchParams;
  const range = readMetricsRange(search, today);
  const { admin } = getDictionary(locale);
  // Signing in comes back to the range the address named, or to the bare
  // screen, which opens on the last days whenever it is opened.
  const named = search.from !== undefined || search.to !== undefined;
  const login = await requireAdmin(
    metricsPath(locale, named ? range : undefined),
    locale
  );
  const dashboard = await caller.metrics.dashboard({ ...range, locale });

  return (
    <AdminShell
      dictionary={admin}
      locale={locale}
      login={login}
      section="metrics"
    >
      <MetricsDashboard
        copy={admin.metrics}
        dashboard={dashboard}
        locale={locale}
        range={range}
        statuses={admin.orders.statuses}
        today={today}
      />
    </AdminShell>
  );
}
