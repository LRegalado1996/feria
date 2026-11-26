/**
 * Where the proxy sends an address no route of the store answers: three
 * segments, one more than a category's page under its group takes, so it
 * reaches the catch-all `(store)/[...rest]`, whose only prerendered address
 * it is. That page is static output that calls `notFound()`, so its status
 * is a real 404, decided at the build: no request renders it again.
 */
export const UNKNOWN_ADDRESS_PATH = "/__unknown__/__unknown__/__unknown__";

/**
 * The addresses of one or two segments that a route of their own answers
 * before `[group]` and `[group]/[category]` can (`*` is any one segment).
 * The proxy leaves them alone; `store-address.test.ts` holds this list to
 * the app's folders, so a new page of that shape fails until it is added.
 */
export const OWN_ROUTES: readonly string[] = [
  "/admin",
  "/admin/*",
  "/cart",
  "/coming-soon",
  "/contacto",
  "/design",
  "/llms.txt",
  "/opengraph-image",
  "/orders/*",
  "/productos",
  "/productos/*",
];

/** What the proxy knows of the store's addresses: its categories and pages. */
export interface StoreAddresses {
  /** Every category and group, shown or not, at its page's address. */
  categories: readonly { path: string; slug: string }[];
  /** Every page built from sections (FER-060), drafts included. */
  pages: readonly { isHome: boolean; isPublished: boolean; slug: string }[];
}

/**
 * What an address of the store is, as its route would find out after the
 * response started: a page or a category to render; a page only a signed-in
 * admin may see; nothing; or another address it leads to, the home's
 * (`/`, temporary: the home can change, FER-070) or a category's under its
 * current group (permanent, its query kept: a link shared before a move
 * still finds the page and its selection).
 */
export type AddressAnswer =
  | { kind: "draft" }
  | { kind: "page" }
  | { kind: "unknown" }
  | { keepQuery: boolean; kind: "redirect"; path: string; status: 307 | 308 };

/** `/a/b` → `["a", "b"]`; `null` with an empty segment (`/`, `//a`, `/a//b`). */
function segmentsOf(pathname: string): [string, ...string[]] | null {
  const [first, ...rest] = pathname.slice(1).split("/");

  return first && !rest.includes("") ? [first, ...rest] : null;
}

function ownRoute(segments: readonly string[]): boolean {
  return OWN_ROUTES.some((route) => {
    const parts = route.slice(1).split("/");

    return (
      parts.length === segments.length &&
      parts.every((part, index) => part === "*" || part === segments[index])
    );
  });
}

/** The category at `slug`'s answer for an address that asked for `asked`. */
function categoryAnswer(
  addresses: StoreAddresses,
  slug: string,
  asked: string
): AddressAnswer | null {
  const found = addresses.categories.find((entry) => entry.slug === slug);

  if (!found) {
    return null;
  }

  return found.path === asked
    ? { kind: "page" }
    : { keepQuery: true, kind: "redirect", path: found.path, status: 308 };
}

/**
 * Whether the proxy decides `pathname` (without its language): an address
 * of one or two segments that `[group]` or `[group]/[category]` answers.
 * Not the home, one of {@link OWN_ROUTES}, three segments or more (the
 * catch-all's real 404 already), or one with an empty segment.
 */
export function decidesAddress(pathname: string): boolean {
  const segments = segmentsOf(pathname);

  return segments !== null && segments.length <= 2 && !ownRoute(segments);
}

/**
 * The answer for `pathname` (without its language) as the store's routes
 * give it: a page built from sections first, then a category, the one
 * named by the last segment, as `(store)/catalog-page.tsx` reads it.
 * `null` for every address the proxy does not decide ({@link decidesAddress}).
 */
export function answerAddress(
  addresses: StoreAddresses,
  pathname: string
): AddressAnswer | null {
  const segments = segmentsOf(pathname);

  if (!segments || !decidesAddress(pathname)) {
    return null;
  }

  const [first, second] = segments;

  if (second !== undefined) {
    return categoryAnswer(addresses, second, pathname) ?? { kind: "unknown" };
  }

  const page = addresses.pages.find((entry) => entry.slug === first);

  if (page?.isHome) {
    return { keepQuery: false, kind: "redirect", path: "/", status: 307 };
  }

  if (page) {
    return page.isPublished ? { kind: "page" } : { kind: "draft" };
  }

  return categoryAnswer(addresses, first, pathname) ?? { kind: "unknown" };
}
