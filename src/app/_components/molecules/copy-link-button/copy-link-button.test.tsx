import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import { reportError } from "@/lib/errors/client";

import { CopyLinkButton } from "./copy-link-button";

vi.mock("@/lib/errors/client", () => ({ reportError: vi.fn() }));

const LABELS = {
  copied: "The order's link is copied.",
  copy: "Copy the order's link",
  field: "Order's link",
  manual: "We couldn't copy it: select the link and copy it yourself.",
};

const PATH = `/en/orders/${"T".repeat(43)}`;

/**
 * `clipboard`: how the browser answers a write, or `missing` for a page
 * that has no clipboard at all.
 */
function setup({
  clipboard = "allowed",
}: { clipboard?: "allowed" | "broken" | "missing" | "refused" } = {}) {
  // userEvent installs a clipboard of its own: the browser's is stubbed
  // after it, so the test decides what the page finds.
  const user = userEvent.setup();
  const writeText = vi.fn<(text: string) => Promise<void>>(async () => {
    if (clipboard === "refused") {
      throw new DOMException("Write permission denied.", "NotAllowedError");
    }

    if (clipboard === "broken") {
      throw new TypeError("Clipboard exploded");
    }

    await Promise.resolve();
  });
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: clipboard === "missing" ? undefined : { writeText },
  });
  render(<CopyLinkButton className="custom" labels={LABELS} path={PATH} />);

  return {
    button: screen.getByRole("button", { name: "Copy the order's link" }),
    status: () => screen.getByRole("status"),
    user,
    writeText,
  };
}

describe("CopyLinkButton", () => {
  test("copies the whole link, on this site's origin, and says so politely", async () => {
    const { button, status, user, writeText } = setup();

    expect(status()).toHaveTextContent(/^$/u);
    await user.click(button);

    expect(writeText).toHaveBeenCalledExactlyOnceWith(
      `${window.location.origin}${PATH}`
    );
    expect(status()).toHaveTextContent("The order's link is copied.");
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(
      document.querySelector('[data-slot="copy-link-button"]')
    ).toHaveClass("custom");
  });

  test.each([["refused"], ["missing"], ["broken"]] as const)(
    "with the clipboard %s, shows the link to copy by hand, selected, and why",
    async (clipboard) => {
      const { button, status, user } = setup({ clipboard });

      await user.click(button);

      const field = await screen.findByRole("textbox", {
        name: "Order's link",
      });
      expect(field).toHaveValue(`${window.location.origin}${PATH}`);
      expect(field).toHaveAttribute("readonly");
      expect(field).toHaveFocus();
      expect(field).toHaveAccessibleDescription(
        "We couldn't copy it: select the link and copy it yourself."
      );
      expect((field as HTMLInputElement).selectionStart).toBe(0);
      expect((field as HTMLInputElement).selectionEnd).toBe(
        `${window.location.origin}${PATH}`.length
      );
      expect(status()).toHaveTextContent(/^$/u);
    }
  );

  test.each([["refused"], ["missing"]] as const)(
    "a clipboard %s by the browser's policy is no defect: nothing is reported",
    async (clipboard) => {
      const { button, user } = setup({ clipboard });

      await user.click(button);

      await screen.findByRole("textbox", { name: "Order's link" });
      expect(reportError).not.toHaveBeenCalled();
    }
  );

  test("a clipboard that fails otherwise is reported, once", async () => {
    const { button, user } = setup({ clipboard: "broken" });

    await user.click(button);

    await screen.findByRole("textbox", { name: "Order's link" });
    expect(reportError).toHaveBeenCalledExactlyOnceWith(
      new TypeError("Clipboard exploded"),
      { action: "Orders.copy_link" }
    );
  });
});
