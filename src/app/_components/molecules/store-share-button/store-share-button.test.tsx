import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";

import { reportError } from "@/lib/errors/client";
import type { Locale } from "@/lib/i18n/config";
import { renderWithI18n } from "@/test/i18n";

import { StoreShareButton } from "./store-share-button";

vi.mock("@/lib/errors/client", () => ({ reportError: vi.fn() }));

// The page's own address carries noise the shared link must not.
const LOCATION = "/products?category=collares&utm_source=ig";
const PATH = "/products?category=collares";
const URL_SHARED = `http://localhost:3000${PATH}`;
const MARK = "\u2060";

interface SetupOptions {
  /** What the clipboard does with the link. */
  copy?: "fail" | "ok";
  locale?: Locale;
  /** The browser's share sheet: absent, or how it ends. */
  share?: "abort" | "fail" | "hold" | "none" | "ok";
}

function setup({
  copy = "ok",
  locale = "es",
  share = "none",
}: SetupOptions = {}) {
  window.history.replaceState(null, "", LOCATION);
  // Set before the browser's own objects are swapped: user-event installs
  // a clipboard of its own.
  const user = userEvent.setup();
  // The held sheets, each closed by the test in turn.
  const closes: (() => void)[] = [];
  const shareSheet = vi.fn(async (_data: ShareData) => {
    if (share === "hold") {
      await new Promise<void>((resolve) => {
        closes.push(resolve);
      });
    }

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

  renderWithI18n(
    <StoreShareButton className="custom" path={PATH} title="Collares" />,
    {
      locale,
    }
  );

  return {
    click: async () => {
      await user.click(
        screen.getByRole("button", {
          name: locale === "es" ? "Compartir" : "Share",
        })
      );
    },
    /** What the live region says, without its invisible mark. */
    said: () => screen.getByRole("status").textContent?.replaceAll(MARK, ""),
    /** Closes the oldest share sheet still open. */
    closeSheet: () => {
      closes.shift()?.();
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
  test("opens the share sheet with the title and the link it is given", async () => {
    const { click, said, shareSheet, writeText } = setup({ share: "ok" });

    await click();

    expect(shareSheet).toHaveBeenCalledExactlyOnceWith({
      title: "Collares",
      url: URL_SHARED,
    });
    expect(writeText).not.toHaveBeenCalled();
    expect(said()).toBe("");
    expect(reportError).not.toHaveBeenCalled();
  });

  test("closing the share sheet does nothing more: no report, no copy", async () => {
    const { click, said, shareSheet, writeText } = setup({ share: "abort" });

    await click();

    await waitFor(() => {
      expect(shareSheet).toHaveBeenCalledExactlyOnceWith({
        title: "Collares",
        url: URL_SHARED,
      });
    });
    expect(writeText).not.toHaveBeenCalled();
    expect(said()).toBe("");
    expect(reportError).not.toHaveBeenCalled();
  });

  test("a share sheet that failed is reported, then the link is copied instead", async () => {
    const { click, said, writeText } = setup({ share: "fail" });

    await click();

    await waitFor(() => {
      expect(said()).toBe("Enlace copiado.");
    });
    expect(writeText).toHaveBeenCalledExactlyOnceWith(URL_SHARED);
    expect(reportError).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ name: "NotAllowedError" }),
      { action: "Catalog.share" }
    );
  });

  test.each([
    ["es", "Enlace copiado."],
    ["en", "Link copied."],
  ] as const)(
    "in %s, without a share sheet, copies the link and says %j",
    async (locale, message) => {
      const { click, said, status, writeText } = setup({ locale });

      await click();

      expect(writeText).toHaveBeenCalledExactlyOnceWith(URL_SHARED);
      await waitFor(() => {
        expect(said()).toBe(message);
      });
      expect(status()).toHaveAttribute("aria-live", "polite");
    }
  );

  test("a second copy is announced again: the same words, the mark flipped", async () => {
    const { click, status } = setup();

    await click();
    await waitFor(() => {
      expect(status().textContent).toBe(`Enlace copiado.${MARK}`);
    });
    await click();

    await waitFor(() => {
      expect(status().textContent).toBe("Enlace copiado.");
    });
  });

  test.each([
    ["es", "No pudimos copiar el enlace."],
    ["en", "We could not copy the link."],
  ] as const)(
    "in %s, a copy that failed is reported and says %j",
    async (locale, message) => {
      const { click, said } = setup({ copy: "fail", locale });

      await click();

      await waitFor(() => {
        expect(said()).toBe(message);
      });
      expect(reportError).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ name: "NotAllowedError" }),
        { action: "Catalog.copy_link" }
      );
    }
  );

  test("shares one at a time: a second press while the sheet is open does nothing", async () => {
    const { click, closeSheet, shareSheet } = setup({ share: "hold" });
    const button = screen.getByRole("button", { name: "Compartir" });
    expect(button).toHaveAttribute("aria-disabled", "false");

    await click();
    await waitFor(() => {
      expect(button).toHaveAttribute("aria-disabled", "true");
    });
    await click();

    expect(shareSheet).toHaveBeenCalledExactlyOnceWith({
      title: "Collares",
      url: URL_SHARED,
    });

    act(() => {
      closeSheet();
    });
    await waitFor(() => {
      expect(button).toHaveAttribute("aria-disabled", "false");
    });
    await click();

    expect(shareSheet.mock.calls).toEqual([
      [{ title: "Collares", url: URL_SHARED }],
      [{ title: "Collares", url: URL_SHARED }],
    ]);
  });
});
