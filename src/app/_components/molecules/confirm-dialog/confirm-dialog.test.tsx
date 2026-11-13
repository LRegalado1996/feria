import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, test, vi } from "vitest";

import { ConfirmDialog, type ConfirmDialogProps } from "./confirm-dialog";

function setup(props: Partial<ConfirmDialogProps> = {}) {
  const onConfirm = vi.fn(() => undefined);
  const onOpenChange = vi.fn((_open: boolean) => undefined);
  const user = userEvent.setup();

  function Harness() {
    const [open, setOpen] = useState(true);

    return (
      <>
        <button type="button">Elsewhere</button>
        <ConfirmDialog
          description="This cannot be undone."
          onConfirm={onConfirm}
          onOpenChange={(next) => {
            setOpen(next);
            onOpenChange(next);
          }}
          open={open}
          title="Delete this post?"
          {...props}
        />
      </>
    );
  }

  render(<Harness />);

  return { onConfirm, onOpenChange, user };
}

describe("ConfirmDialog", () => {
  test("asks with a title, a description and the two answers", () => {
    setup();

    const dialog = screen.getByRole("dialog", { name: "Delete this post?" });
    expect(dialog).toHaveAccessibleDescription("This cannot be undone.");
    expect(screen.getByRole("button", { name: "Cancel" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Delete" })).toHaveAttribute(
      "data-variant",
      "destructive"
    );
  });

  test("runs the action on confirm, and leaves closing to the caller", async () => {
    const { onConfirm, onOpenChange, user } = setup();

    await user.click(screen.getByRole("button", { name: "Delete" }));

    expect(onConfirm).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ type: "click" })
    );
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  test("closes on cancel without running the action", async () => {
    const { onConfirm, onOpenChange, user } = setup();

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onOpenChange).toHaveBeenCalledExactlyOnceWith(false);
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  test("shows the action running and refuses a second confirm", async () => {
    const { onConfirm, user } = setup({
      isPending: true,
      pendingLabel: "Removing…",
    });

    const confirm = screen.getByRole("button", { name: "Removing…" });
    await user.click(confirm);

    expect(confirm).toBeDisabled();
    expect(onConfirm).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("button", { name: "Delete" })
    ).not.toBeInTheDocument();
  });

  test("says Deleting… while running unless told otherwise", () => {
    setup({ isPending: true });

    expect(screen.getByRole("button", { name: "Deleting…" })).toBeDisabled();
  });

  test("takes its own labels", () => {
    setup({ cancelLabel: "Keep it", confirmLabel: "Remove" });

    expect(screen.getByTestId("confirm-dialog-confirm")).toHaveTextContent(
      "Remove"
    );
    expect(screen.getByRole("button", { name: "Keep it" })).toBeEnabled();
    expect(
      screen.queryByRole("button", { name: "Cancel" })
    ).not.toBeInTheDocument();
  });

  test("hands the close to the caller to place focus", async () => {
    const onCloseAutoFocus = vi.fn((event: Event) => {
      event.preventDefault();
      screen.getByRole("button", { name: "Elsewhere" }).focus();
    });
    const { user } = setup({ onCloseAutoFocus });

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onCloseAutoFocus).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ type: "focusScope.autoFocusOnUnmount" })
    );
    expect(screen.getByRole("button", { name: "Elsewhere" })).toHaveFocus();
  });
});
