import { notFound } from "next/navigation";

// Nothing to validate for instant navigation: this page never renders, it
// only hands the request to `not-found.tsx`.
export const instant = false;

/**
 * Every address no other page answers. Without it an unknown URL would skip
 * the `[locale]` layout and get Next's bare 404; here it renders this
 * segment's `not-found.tsx`, in the visitor's language and inside the app's
 * shell.
 */
export default function UnknownPage() {
  notFound();
}
