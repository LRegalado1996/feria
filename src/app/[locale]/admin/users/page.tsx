import { AdminSectionPlaceholder } from "../admin-section-placeholder";

interface UsersPageProps {
  params: Promise<{ locale: string }>;
}

/** `/admin/users`: says it is coming until the logins (FER-015) lands. */
export default function UsersPage({ params }: UsersPageProps) {
  return <AdminSectionPlaceholder params={params} section="users" />;
}
