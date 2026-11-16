import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import { StoreSkipLink } from "./store-skip-link";

/**
 * Two frames with the same content id, as a page left behind and the one on
 * screen are: the link sits in the second.
 */
function setup({ inFrame = true } = {}) {
  const onClick = vi.fn<() => void>();
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

  return {
    link: screen.getByRole("link", { name: "Saltar al contenido" }),
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

  test("moves focus to the content of its own frame, not the first match in the document", async () => {
    const { link, onClick, user } = setup();

    await user.click(link);

    expect(screen.getByTestId("on-screen")).toHaveFocus();
    expect(onClick).toHaveBeenCalledOnce();
  });

  test("outside a frame it leaves the jump to the browser", async () => {
    const { link, onClick, user } = setup({ inFrame: false });
    let followed = false;
    link.addEventListener("click", (event) => {
      followed = !event.defaultPrevented;
    });

    await user.click(link);

    expect(followed).toBe(true);
    expect(onClick).toHaveBeenCalledOnce();
  });
});
