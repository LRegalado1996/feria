import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test } from "vitest";

import { renderWithI18n } from "@/test/i18n";

import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "./sheet";

/** A sheet opened by its trigger: a title, a line, a field and an action. */
function setup() {
  const user = userEvent.setup();

  renderWithI18n(
    <Sheet>
      <SheetTrigger>Filters</SheetTrigger>
      <SheetContent className="custom" data-testid="sheet">
        <SheetHeader className="head" closeLabel="Close filters">
          <SheetTitle className="title">Filters</SheetTitle>
          <SheetDescription className="line">Choose articles.</SheetDescription>
        </SheetHeader>
        <SheetBody className="body">
          <input aria-label="Name" />
        </SheetBody>
        <SheetFooter className="foot">
          <button type="button">Apply</button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
  const trigger = screen.getByRole("button", { name: "Filters" });

  return {
    open: async () => {
      await user.click(trigger);
      return await screen.findByRole("dialog");
    },
    trigger,
    user,
  };
}

describe("Sheet", () => {
  test("opens a modal dialog named by its title and described by its line", async () => {
    const { open } = setup();

    const dialog = await open();

    expect(dialog).toHaveAccessibleName("Filters");
    expect(dialog).toHaveAccessibleDescription("Choose articles.");
    expect(dialog).toHaveClass("custom");
  });

  test("moves focus inside, to the close button named for what it closes", async () => {
    const { open } = setup();

    await open();

    const close = screen.getByRole("button", { name: "Close filters" });
    expect(close).toHaveFocus();
  });

  test("Escape closes it and gives focus back to its trigger", async () => {
    const { open, trigger, user } = setup();
    await open();

    await user.keyboard("{Escape}");

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
    expect(trigger).toHaveFocus();
  });

  test("the close button closes it", async () => {
    const { open, trigger, user } = setup();
    await open();

    await user.click(screen.getByRole("button", { name: "Close filters" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
    expect(trigger).toHaveFocus();
  });

  test("carries the slots reduced motion stills, and lays out its parts", async () => {
    const { open } = setup();

    const dialog = await open();

    expect(dialog).toHaveAttribute("data-slot", "dialog-content");
    expect(screen.getByTestId("dialog-overlay")).toHaveAttribute(
      "data-slot",
      "dialog-overlay"
    );
    expect(
      [
        "sheet-header",
        "sheet-title",
        "sheet-description",
        "sheet-body",
        "sheet-footer",
      ].map(
        (slot) => dialog.querySelector(`[data-slot="${slot}"]`)?.className ?? ""
      )
    ).toEqual([
      expect.stringContaining("head"),
      expect.stringContaining("title"),
      expect.stringContaining("line"),
      expect.stringContaining("body"),
      expect.stringContaining("foot"),
    ]);
  });
});
