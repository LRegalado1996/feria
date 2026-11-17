import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { MouseEvent } from "react";
import { describe, expect, test, vi } from "vitest";

import { StoreSkipLink } from "./store-skip-link";

/**
 * Two frames with the same content id, as a page left behind and the one on
 * screen are: the link sits in the second. Every click the link receives is
 * kept, to be read once React's handler is done with it: a listener on the
 * link itself runs before React's, which listens at the root.
 */
function setup({ inFrame = true } = {}) {
  const onClick = vi.fn<(event: MouseEvent<HTMLAnchorElement>) => void>();
  const user = userEvent.setup();
  const link = (
    <StoreSkipLink onClick={onClick} target="store-main">
      Saltar al contenido
    </StoreSkipLink>
  );
  render(
    <>
      <div data-slot="store-frame" hidden>
        <div data-testid="left-behind" id="store-main" tabIndex={-1} />
      </div>
      {inFrame ? (
        <div data-slot="store-frame">
          {link}
          <div data-testid="on-screen" id="store-main" tabIndex={-1} />
        </div>
      ) : (
        link
      )}
    </>
  );
  const anchor = screen.getByRole("link", { name: "Saltar al contenido" });
  const clicks: Event[] = [];
  anchor.addEventListener("click", (event) => {
    clicks.push(event);
  });

  return {
    /** Whether the browser's own jump was cancelled, click by click. */
    cancelled: () => clicks.map((event) => event.defaultPrevented),
    clicks,
    link: anchor,
    onClick,
    user,
  };
}

describe("StoreSkipLink", () => {
  test("is a link to the content's id, hidden until it has focus", () => {
    const { link } = setup();

    expect(link).toHaveAttribute("href", "#store-main");
    expect(link).toHaveAttribute("data-slot", "store-skip-link");
    expect(link).toHaveClass("sr-only", "focus:not-sr-only");
  });

  test("moves focus to the content of its own frame, instead of the browser's jump to the first match in the document", async () => {
    const { cancelled, clicks, link, onClick, user } = setup();

    await user.click(link);

    expect(screen.getByTestId("on-screen")).toHaveFocus();
    expect(cancelled()).toEqual([true]);
    expect(onClick).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ nativeEvent: clicks[0] })
    );
  });

  test("outside a frame it leaves the jump to the browser", async () => {
    const { cancelled, clicks, link, onClick, user } = setup({
      inFrame: false,
    });

    await user.click(link);

    expect(cancelled()).toEqual([false]);
    expect(onClick).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ nativeEvent: clicks[0] })
    );
  });
});
