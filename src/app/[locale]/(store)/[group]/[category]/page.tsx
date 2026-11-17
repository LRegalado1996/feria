import type { Metadata } from "next";

import {
  type CatalogPageProps,
  CatalogPageView,
  catalogMetadata,
} from "../../catalog-page";

// Read before anything is sent, like every catalog page: an unknown address
// is a real 404, and a category under a group it is not in a permanent
// redirect to its page (docs/agents/nextjs.md § Store pages).
export const instant = false;

/** A category's page under its group: its title, texts and share card. */
export async function generateMetadata(
  props: CatalogPageProps
): Promise<Metadata> {
  return await catalogMetadata(props);
}

/** A category of a group, under it: `/bijouterie/anillos` (FER-043). */
export default async function CategoryPage(props: CatalogPageProps) {
  return await CatalogPageView(props);
}
