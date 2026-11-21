import type { Metadata } from "next";

import {
  type CatalogPageProps,
  CatalogPageView,
  catalogMetadata,
} from "../catalog-page";
import {
  resolveStorePage,
  StorePageView,
  storePageMetadata,
} from "../store-page-view";

// Read before anything is sent, like every catalog page: an unknown address
// is a real 404 and a category in a group a permanent redirect to its page
// under the group (docs/agents/nextjs.md § Store pages).
export const instant = false;

type GroupPageProps = CatalogPageProps & {
  params: Promise<{ group: string; locale: string }>;
};

/**
 * A page of the store's (FER-060), a group's or a category's: its title,
 * texts and share card. Pages, groups and categories share the address
 * space, each address being one of them at most.
 */
export async function generateMetadata(
  props: GroupPageProps
): Promise<Metadata> {
  const page = await resolveStorePage(props);

  return page ? storePageMetadata(page) : await catalogMetadata(props);
}

/**
 * A page built from sections (FER-060), a group with every article of its
 * categories (`/bijouterie`), or a category in no group (`/burbujeros`)
 * (FER-043).
 */
export default async function GroupPage(props: GroupPageProps) {
  const page = await resolveStorePage(props);

  return page ? await StorePageView(page) : await CatalogPageView(props);
}
