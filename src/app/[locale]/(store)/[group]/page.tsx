import type { Metadata } from "next";

import {
  type CatalogPageProps,
  CatalogPageView,
  catalogMetadata,
} from "../catalog-page";

// Read before anything is sent, like every catalog page: an unknown address
// is a real 404 and a category in a group a permanent redirect to its page
// under the group (docs/agents/nextjs.md § Store pages).
export const instant = false;

/** A group's or a category's page: its title, texts and share card. */
export async function generateMetadata(
  props: CatalogPageProps
): Promise<Metadata> {
  return await catalogMetadata(props);
}

/**
 * A group, with every article of its categories (`/bijouterie`), or a
 * category in no group (`/burbujeros`) (FER-043).
 */
export default async function GroupPage(props: CatalogPageProps) {
  return await CatalogPageView(props);
}
