import { AdminSectionPlaceholder } from "../admin-section-placeholder";

interface MetricsPageProps {
  params: Promise<{ locale: string }>;
}

/** `/admin/metrics`: says it is coming until the metrics (FER-030) lands. */
export default function MetricsPage({ params }: MetricsPageProps) {
  return <AdminSectionPlaceholder params={params} section="metrics" />;
}
