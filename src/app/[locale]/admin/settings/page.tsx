import { AdminSectionPlaceholder } from "../admin-section-placeholder";

interface SettingsPageProps {
  params: Promise<{ locale: string }>;
}

/** `/admin/settings`: says it is coming until the company settings (FER-014) lands. */
export default function SettingsPage({ params }: SettingsPageProps) {
  return <AdminSectionPlaceholder params={params} section="settings" />;
}
