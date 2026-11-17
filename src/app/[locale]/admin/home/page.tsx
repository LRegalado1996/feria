import { AdminSectionPlaceholder } from "../admin-section-placeholder";

interface HomePageProps {
  params: Promise<{ locale: string }>;
}

/** `/admin/home`: says it is coming until the home's curation (FER-020) lands. */
export default function HomePage({ params }: HomePageProps) {
  return <AdminSectionPlaceholder params={params} section="home" />;
}
