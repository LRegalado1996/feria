import type userEvent from "@testing-library/user-event";
import { flushSync } from "react-dom";

/**
 * Clicks `element` as a browser delivers a person's click (FER-064). Between
 * the click's way down and its way up a browser runs the microtasks, and
 * React commits what a handler on the way down scheduled: a panel closed
 * there is gone, with its links, before their own handlers run. A click a
 * test dispatches runs no microtasks in between, so it hides that; here a
 * listener on the element commits at that point, as the browser would.
 *
 *   await browserClick(user, screen.getByRole("link", { name: "Orders" }));
 */
export async function browserClick(
  user: ReturnType<typeof userEvent.setup>,
  element: Element
): Promise<void> {
  const commit = () => {
    flushSync(() => undefined);
  };
  element.addEventListener("click", commit, { once: true });

  try {
    await user.click(element);
  } finally {
    element.removeEventListener("click", commit);
  }
}
