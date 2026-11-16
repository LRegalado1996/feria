import { notFound } from "next/navigation";

// Static output made on an address's first visit, like the store's home: the
// response waits for it, so `notFound()` below is a real 404 instead of a
// page that streamed with a 200 (docs/agents/nextjs.md § Store pages).
export const ensureStatic = "navigation";

// Nothing to validate for instant navigation: this page never renders, it
// only hands the request to the store's `not-found.tsx`.
export const instant = false;

/**
 * A sample that can never be a page, so Next renders each unknown address
 * in full on its first visit (the store layout's own sample covers the
 * store segment).
 */
export function generateStaticParams() {
  return [{ rest: ["__sample__"] }];
}

/**
 * Every address under a store that no page of it answers (a typo, an old
 * link). Without it the address would fall through to the app's catch-all
 * and lose the store's header and footer; here it renders the store's own
 * not-found page, inside them. An address that is not a store at all is
 * answered by the layout first, with the app's 404.
 */
export default function UnknownStorePage() {
  notFound();
}
