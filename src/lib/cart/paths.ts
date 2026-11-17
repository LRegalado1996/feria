/**
 * The checkout page (FER-026, FER-045): the order's summary and the
 * shopper's details. The header's cart links here, so the cart is reached
 * before the page's script runs; with it, the link opens the side panel.
 */
export const CHECKOUT_PATH = "/cart";

/**
 * A plain click with the main button: not one that opens a new tab or
 * window (a modifier key, the middle button), which leaves the page as it
 * is.
 */
export function isPlainClick(event: {
  altKey: boolean;
  button: number;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
}): boolean {
  return (
    event.button === 0 &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.shiftKey
  );
}

/**
 * Whether a link's address is the page already open (its path and query):
 * following it from the side panel only closes the panel.
 */
export function isSamePage(
  href: string,
  current: Pick<Location, "href" | "origin" | "pathname" | "search">
): boolean {
  const url = new URL(href, current.href);

  return (
    url.origin === current.origin &&
    url.pathname === current.pathname &&
    url.search === current.search
  );
}
