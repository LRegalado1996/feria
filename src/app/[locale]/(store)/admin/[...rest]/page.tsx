import { notFound } from "next/navigation";

// Static output made on an address's first visit, like the store's own
// catch-all: the response waits for it, so `notFound()` is a real 404.
export const ensureStatic = "navigation";

// Nothing to validate for instant navigation: this page never renders.
export const instant = false;

/** A sample that can never be a page: no address has an underscore. */
export function generateStaticParams() {
  return [{ rest: ["__sample__"] }];
}

/**
 * Every address under `/admin` that no admin section answers, such as the
 * multi-store site's `/admin/lr-market` (FER-038). Without it, one of two
 * segments would have a catalog page's shape (`/bijouterie/anillos`,
 * FER-043) and reach that page, whose 404 a browser gets after its shell
 * with a 200. It renders the store's not-found page with a real 404.
 */
export default function UnknownAdminPage() {
  notFound();
}
