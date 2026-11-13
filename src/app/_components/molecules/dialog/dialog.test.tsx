import { screen } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import { renderWithI18n } from "@/test/i18n";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./dialog";

function setup({ locale = "en" }: { locale?: "en" | "es" } = {}) {
  const onOpenChange = vi.fn((_open: boolean) => undefined);
  const user = userEvent.setup();

  renderWithI18n(
    <Dialog onOpenChange={onOpenChange} open>
      <DialogContent className="custom">
        <DialogHeader>
          <DialogTitle>Delete this post?</DialogTitle>
          <DialogDescription>It cannot be undone.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <button type="button">Delete</button>
        </DialogFooter>
      </DialogContent>
    </Dialog>,
    { locale }
  );

  return { dialog: screen.getByRole("dialog"), onOpenChange, user };
}

describe("Dialog", () => {
  test("is a modal dialog named by its title and described by its description", () => {
    const { dialog } = setup();

    expect(dialog).toHaveAccessibleName("Delete this post?");
    expect(dialog).toHaveAccessibleDescription("It cannot be undone.");
    expect(dialog).toHaveAttribute("data-slot", "dialog-content");
    expect(dialog).toHaveClass("custom", "max-h-[calc(100dvh-2rem)]");
    // The e2e `expectDialogRemoved` waits for this test id to be gone: without
    // it, that check would pass before the dialog ever opened.
    expect(screen.getByTestId("dialog-overlay")).toHaveAttribute(
      "data-slot",
      "dialog-overlay"
    );
  });

  test("lays out its header and footer slots", () => {
    const { dialog } = setup();

    expect(
      dialog.querySelector('[data-slot="dialog-header"]')
    ).toHaveTextContent("Delete this post?");
    expect(
      dialog.querySelector('[data-slot="dialog-footer"]')
    ).toContainElement(screen.getByRole("button", { name: "Delete" }));
  });

  test.each([
    [
      "the close button",
      async (user: UserEvent) => {
        await user.click(screen.getByRole("button", { name: "Close dialog" }));
      },
    ],
    [
      "Escape",
      async (user: UserEvent) => {
        await user.keyboard("{Escape}");
      },
    ],
  ])("asks to close on %s", async (_label, close) => {
    const { onOpenChange, user } = setup();

    await close(user);

    expect(onOpenChange).toHaveBeenCalledExactlyOnceWith(false);
  });

  test("does not ask to close while the user acts inside it", async () => {
    const { onOpenChange, user } = setup();

    await user.click(screen.getByRole("button", { name: "Delete" }));

    expect(onOpenChange).not.toHaveBeenCalled();
  });

  test("names its close button in Spanish on a Spanish page", async () => {
    const { onOpenChange, user } = setup({ locale: "es" });

    await user.click(screen.getByRole("button", { name: "Cerrar diálogo" }));

    expect(onOpenChange).toHaveBeenCalledExactlyOnceWith(false);
  });
});
