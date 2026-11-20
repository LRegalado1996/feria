import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Link from "next/link";
import { describe, expect, test, vi } from "vitest";

import { followedLink } from "./followed-link";

/**
 * A list of one link (its icon inside it) and a gap beside it, telling
 * `seen` which link each click inside it follows. No link is followed: the
 * test's page stays where it is.
 */
function setup() {
  const seen = vi.fn();
  render(
    <ul
      onClickCapture={(event) => {
        event.preventDefault();
        seen(followedLink(event)?.getAttribute("href") ?? null);
      }}
    >
      <li>
        <Link href="/admin/products?page=2">
          <span data-testid="icon">→</span>
          Page 2
        </Link>
      </li>
      <li data-testid="gap">·</li>
    </ul>
  );

  return { seen, user: userEvent.setup() };
}

describe("followedLink", () => {
  test("is the link a plain click follows, from the link or from inside it", async () => {
    const { seen, user } = setup();

    await user.click(screen.getByRole("link", { name: "→ Page 2" }));
    await user.click(screen.getByTestId("icon"));

    expect(seen.mock.calls).toEqual([
      ["/admin/products?page=2"],
      ["/admin/products?page=2"],
    ]);
  });

  test("is none for a click beside the links", async () => {
    const { seen, user } = setup();

    await user.click(screen.getByTestId("gap"));

    expect(seen).toHaveBeenCalledExactlyOnceWith(null);
  });

  test.each(["Alt", "Control", "Meta", "Shift"])(
    "is none for a click with %s held, which opens the link elsewhere",
    async (key) => {
      const { seen, user } = setup();

      await user.keyboard(`{${key}>}`);
      await user.click(screen.getByRole("link", { name: "→ Page 2" }));
      await user.keyboard(`{/${key}}`);

      expect(seen).toHaveBeenCalledExactlyOnceWith(null);
    }
  );
});
