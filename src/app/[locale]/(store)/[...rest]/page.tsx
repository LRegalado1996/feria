import { notFound } from "next/navigation";

import { UNKNOWN_ADDRESS_PATH } from "@/lib/catalog/store-address";

// Static output made on an address's first visit, like an article's: the
// response waits for it, so `notFound()` below is a real 404 instead of a
// page that streamed with a 200 (docs/agents/nextjs.md § Store pages).
export const ensureStatic = "navigation";

// Nothing to validate for instant navigation: this page never renders, it
// only hands the request to the store's `not-found.tsx`.
export const instant = false;

/**
 * The address the proxy sends every unknown one- or two-segment address to
 * (FER-069), prerendered with the build in both languages; any other
 * address is rendered in full on its first visit.
 */
export function generateStaticParams() {
  return [{ rest: UNKNOWN_ADDRESS_PATH.slice(1).split("/") }];
}

/**
 * Every address no page answers: a typo, an old link, and every address of
 * the multi-store site, such as `/lr-market/...`, `/admin/lr-market/...` or
 * `/admin/platform/...` (FER-038). Those of one or two segments come here
 * from the proxy, which knows the store's pages and categories; the rest
 * have three segments or more. It renders the store's not-found page,
 * under the store's header, with a real 404.
 */
export default function UnknownPage() {
  notFound();
}
