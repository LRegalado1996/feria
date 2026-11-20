import { isPlainClick } from "@/lib/cart/paths";

/**
 * The link a click inside a list follows in this tab, or `null`: none when
 * the click lands beside the links, or opens one in another tab or window
 * (a modifier key). A list that moves focus once the page it led to shows
 * arms itself only for this, or a flag left armed by a click that changed
 * nothing steals focus on a later change.
 */
export function followedLink(
  event: Parameters<typeof isPlainClick>[0] & { target: EventTarget | null }
): Element | null {
  if (!isPlainClick(event) || !(event.target instanceof Element)) {
    return null;
  }

  return event.target.closest("a[href]");
}
