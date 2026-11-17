import type { Metadata } from "next";

import {
  type CatalogPageProps,
  CatalogPageView,
  catalogMetadata,
} from "../catalog-page";

// The page reads its address and its articles before anything is sent, by
// design: the first response holds them, for a crawler that runs no script
// (docs/agents/nextjs.md § Store pages). This tells Next's instant-navigation
// check that the wait is intended.
export const instant = false;

/** The page of all the store's articles: its title, texts and share card. */
export async function generateMetadata(
  props: CatalogPageProps
): Promise<Metadata> {
  return await catalogMetadata(props);
}

/** Every article of the store, at `/productos` (FER-043). */
export default async function AllArticlesPage(props: CatalogPageProps) {
  return await CatalogPageView(props);
}
