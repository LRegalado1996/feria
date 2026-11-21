import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { focusFirstField } from "./focus-first-field";

function setup() {
  render(
    <>
      <button type="button">Elsewhere</button>
      <div data-testid="card">
        <label>
          Spanish name
          <input />
        </label>
        <label>
          English name
          <input />
        </label>
      </div>
    </>
  );

  const card = screen.getByTestId("card");
  const scrolled = vi.spyOn(card, "scrollIntoView");
  const elsewhere = screen.getByRole("button", { name: "Elsewhere" });
  elsewhere.focus();

  return { card, elsewhere, scrolled };
}

describe("focusFirstField", () => {
  test("brings the card's top into view and focuses its first field", () => {
    const { card, scrolled } = setup();

    focusFirstField(card);

    expect(scrolled).toHaveBeenCalledExactlyOnceWith({ block: "start" });
    expect(screen.getByRole("textbox", { name: "Spanish name" })).toHaveFocus();
  });

  test("does nothing without a card: focus stays where it was", () => {
    const { elsewhere, scrolled } = setup();

    focusFirstField(null);

    expect(scrolled).not.toHaveBeenCalled();
    expect(elsewhere).toHaveFocus();
  });
});
