import { AdminSectionPlaceholder } from "../admin-section-placeholder";

interface ProductsPageProps {
  params: Promise<{ locale: string }>;
}

/** `/admin/products`: says it is coming until the articles (FER-019) lands. */
export default function ProductsPage({ params }: ProductsPageProps) {
  return <AdminSectionPlaceholder params={params} section="products" />;
}
