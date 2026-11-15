import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";

import { reportError } from "@/lib/errors/client";
import type { Locale } from "@/lib/i18n/config";
import { renderWithI18n } from "@/test/i18n";

import { StoreShareButton } from "./store-share-button";

vi.mock("@/lib/errors/client", () => ({ reportError: vi.fn() }));

const PATH = "/lr-market/products?category=collares";

interface SetupOptions {
  /** What the clipboard does with the link. */
  copy?: "fail" | "ok";
  locale?: Locale;
  /** The browser's share sheet: absent, or how it ends. */
  share?: "abort" | "fail" | "none" | "ok";
}

function setup({
  copy = "ok",
  locale = "es",
  share = "none",
}: SetupOptions = {}) {
  window.history.replaceState(null, "", PATH);
  // Set before the browser's own objects are swapped: user-event installs
  // a clipboard of its own.
  const user = userEvent.setup();
  const shareSheet = vi.fn(async (_data: ShareData) => {
    if (share === "abort") {
      throw new DOMException("Share canceled", "AbortError");
    }

    if (share === "fail") {
      throw new DOMException("Not allowed", "NotAllowedError");
    }
  });
  const writeText = vi.fn(async (_text: string) => {
    if (copy === "fail") {
      throw new DOMException("Denied", "NotAllowedError");
    }
  });
  Object.defineProperty(navigator, "share", {
    configurable: true,
    value: share === "none" ? undefined : shareSheet,
  });
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });

  renderWithI18n(<StoreShareButton className="custom" title="Collares" />, {
    locale,
  });

  return {
    click: async () => {
      await user.click(
        screen.getByRole("button", {
          name: locale === "es" ? "Compartir" : "Share",
        })
      );
    },
    shareSheet,
    status: () => screen.getByRole("status"),
    writeText,
  };
}

afterEach(() => {
  Reflect.deleteProperty(navigator, "share");
  Reflect.deleteProperty(navigator, "clipboard");
});

describe("StoreShareButton", () => {
  test("opens the share sheet with the page's title and address", async () => {
    const { click, shareSheet, status, writeText } = setup({ share: "ok" });

    await click();

    expect(shareSheet).toHaveBeenCalledExactlyOnceWith({
      title: "Collares",
      url: `http://localhost:3000${PATH}`,
    });
    expect(writeText).not.toHaveBeenCalled();
    expect(status()).toHaveTextContent(/^$/u);
    expect(reportError).not.toHaveBeenCalled();
  });

  test("closing the share sheet is no failure: nothing is reported", async () => {
    const { click, shareSheet } = setup({ share: "abort" });

    await click();

    await waitFor(() => {
      expect(shareSheet).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ title: "Collares" })
      );
    });
    expect(reportError).not.toHaveBeenCalled();
  });

  test("reports a share sheet that failed", async () => {
    const { click } = setup({ share: "fail" });

    await click();

    await waitFor(() => {
      expect(reportError).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ name: "NotAllowedError" }),
        { action: "Catalog.share" }
      );
    });
  });

  test.each([
    ["es", "Enlace copiado."],
    ["en", "Link copied."],
  ] as const)(
    "in %s, without a share sheet, copies the address and says %j",
    async (locale, message) => {
      const { click, status, writeText } = setup({ locale });

      await click();

      expect(writeText).toHaveBeenCalledExactlyOnceWith(
        `http://localhost:3000${PATH}`
      );
      await waitFor(() => {
        expect(status().textContent).toBe(message);
      });
      expect(status()).toHaveAttribute("aria-live", "polite");
    }
  );

  test.each([
    ["es", "No pudimos copiar el enlace."],
    ["en", "We could not copy the link."],
  ] as const)(
    "in %s, a copy that failed is reported and says %j",
    async (locale, message) => {
      const { click, status } = setup({ copy: "fail", locale });

      await click();

      await waitFor(() => {
        expect(status().textContent).toBe(message);
      });
      expect(reportError).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ name: "NotAllowedError" }),
        { action: "Catalog.copy_link" }
      );
    }
  );
});
