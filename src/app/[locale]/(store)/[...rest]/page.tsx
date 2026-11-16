import { notFound } from "next/navigation";

// Static output made on an address's first visit, like an article's: the
// response waits for it, so `notFound()` below is a real 404 instead of a
// page that streamed with a 200 (docs/agents/nextjs.md § Store pages).
export const ensureStatic = "navigation";

// Nothing to validate for instant navigation: this page never renders, it
// only hands the request to the store's `not-found.tsx`.
export const instant = false;

/**
 * A sample that can never be a page, so Next renders each unknown address
 * in full on its first visit.
 */
export function generateStaticParams() {
  return [{ rest: ["__sample__"] }];
}

/**
 * Every address no page answers: a typo, an old link, and every address of
 * the multi-store site, such as `/lr-market/...`, `/admin/lr-market/...` or
 * `/admin/platform/...` (FER-038). It renders the store's not-found page,
 * under the store's header, with a real 404.
 */
export default function UnknownPage() {
  notFound();
}
