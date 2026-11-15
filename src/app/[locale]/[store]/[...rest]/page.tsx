import { notFound } from "next/navigation";

// Nothing to validate for instant navigation: this page never renders, it
// only hands the request to the store's `not-found.tsx`.
export const instant = false;

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
