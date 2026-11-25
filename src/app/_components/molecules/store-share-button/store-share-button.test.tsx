import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import type { Locale } from "@/lib/i18n/config";
import { collectHydrationErrors } from "@/test/hydration";
import { createI18nWrapper, renderWithI18n } from "@/test/i18n";

import { StoreShareButton } from "./store-share-button";

const { reportError } = vi.hoisted(() => ({ reportError: vi.fn() }));

vi.mock("@/lib/errors/client", () => ({ reportError }));

const URL_TO_SHARE = "https://market.example.com/productos/collar-de-perlas";

/** A DOMException the browser would throw, by its name. */
function refusal(name: string) {
  return new DOMException("The browser said no", name);
}

/**
 * The button on a page whose browser has a share sheet (`share`, a phone)
 * or none (a computer), and a clipboard that copies, refuses or is absent.
 */
function setup({
  clipboard = "copies",
  locale = "es",
  share,
}: {
  clipboard?: "absent" | "copies" | "fails" | "refuses";
  locale?: Locale;
  share?: () => Promise<void>;
} = {}) {
  // Started first: user-event puts a clipboard of its own on the navigator.
  const user = userEvent.setup();
  const shareSpy = share ? vi.fn(share) : undefined;
  const writeText = vi.fn(async (_text: string) => {
    if (clipboard === "refuses") {
      throw refusal("NotAllowedError");
    }

    if (clipboard === "fails") {
      throw new Error("Clipboard broke");
    }
  });
  // Only what the button reads, and what the page's own code asks of it.
  vi.stubGlobal("navigator", {
    language: navigator.language,
    userAgent: navigator.userAgent,
    ...(clipboard === "absent" ? {} : { clipboard: { writeText } }),
    share: shareSpy,
  });
  renderWithI18n(
    <StoreShareButton title="Collar de perlas" url={URL_TO_SHARE} />,
    { locale }
  );
  const button = screen.getByTestId("store-article-share");

  return {
    button,
    press: async () => {
      await user.click(button);
    },
    share: shareSpy,
    status: () => screen.getByTestId("store-article-share-status"),
    writeText,
  };
}

describe("StoreShareButton", () => {
  test.each([
    ["es", "Compartir"],
    ["en", "Share"],
  ] as const)(
    "in %s is a small white circle with the icon alone, named %j for a screen reader",
    (locale, name) => {
      const { button } = setup({ locale });

      expect(button).toHaveAccessibleName(name);
      // No word on screen: the icon says it (Lucas, FER-019).
      expect(button).toHaveTextContent(/^$/u);
      expect(button).toHaveAttribute("data-size", "icon-sm");
      expect(button).toHaveAttribute("data-variant", "outline");
      expect(button.querySelector("svg")).toHaveClass("lucide-share-2");
    }
  );

  test("says what happened in a moss note under the circle, which reads on any photo", async () => {
    const { press, status } = setup();

    await press();

    await waitFor(() => {
      expect(status()).not.toHaveTextContent(/^$/u);
    });
    expect(status()).toHaveClass(
      "absolute",
      "top-full",
      "bg-store-contrast",
      "text-store-background"
    );
  });

  test("on a phone, opens its share sheet with the article's name and address, and copies nothing", async () => {
    const { press, share, status, writeText } = setup({
      share: async () => {
        await Promise.resolve();
      },
    });

    await press();

    expect(share).toHaveBeenCalledExactlyOnceWith({
      title: "Collar de perlas",
      url: URL_TO_SHARE,
    });
    expect(writeText).not.toHaveBeenCalled();
    expect(status()).toHaveTextContent(/^$/u);
  });

  test("a closed sheet is not an error: nothing is copied, said or reported", async () => {
    const { press, status, writeText } = setup({
      share: async () => {
        await Promise.reject(refusal("AbortError"));
      },
    });

    await press();

    expect(writeText).not.toHaveBeenCalled();
    expect(status()).toHaveTextContent(/^$/u);
    expect(reportError).not.toHaveBeenCalled();
  });

  test.each([
    ["the browser refuses", refusal("NotAllowedError"), false],
    ["fails", new Error("Share broke"), true],
  ])(
    "a sheet that %s copies the address instead, reporting only a failure",
    async (_case, error, reported) => {
      const { press, status, writeText } = setup({
        share: async () => {
          await Promise.reject(error);
        },
      });

      await press();

      await waitFor(() => {
        expect(status()).toHaveTextContent(
          "Enlace copiado: pegalo donde quieras."
        );
      });
      expect(writeText).toHaveBeenCalledExactlyOnceWith(URL_TO_SHARE);
      expect(reportError.mock.calls).toEqual(
        reported ? [[error, { action: "Article.share" }]] : []
      );
    }
  );

  test("on a computer, copies the address and says so, its icon a check", async () => {
    const { button, press, status, writeText } = setup();

    await press();

    await waitFor(() => {
      expect(status()).toHaveTextContent(
        "Enlace copiado: pegalo donde quieras."
      );
    });
    expect(writeText).toHaveBeenCalledExactlyOnceWith(URL_TO_SHARE);
    expect(button.querySelector("svg")).toHaveClass("lucide-check");
  });

  test("copied twice, the message changes its invisible mark, so it is said again", async () => {
    const { press, status } = setup();

    await press();
    await waitFor(() => {
      expect(status().textContent).toBe(
        "Enlace copiado: pegalo donde quieras.⁠"
      );
    });
    await press();

    await waitFor(() => {
      expect(status().textContent).toBe(
        "Enlace copiado: pegalo donde quieras."
      );
    });
  });

  test.each([
    ["refuses", "refuses", []],
    [
      "fails",
      "fails",
      [
        [
          expect.objectContaining({ message: "Clipboard broke" }),
          { action: "Article.copy_link" },
        ],
      ],
    ],
    ["is absent", "absent", []],
  ] as const)(
    "a clipboard that %s says to copy the address by hand",
    async (_case, clipboard, reports) => {
      const { press, status } = setup({ clipboard });

      await press();

      await waitFor(() => {
        expect(status()).toHaveTextContent(
          "No pudimos copiar el enlace. Copiá la dirección de arriba del navegador."
        );
      });
      expect(reportError.mock.calls).toEqual(reports);
    }
  );

  test("is off in the server's HTML and while hydrating, without a mismatch", () => {
    const I18n = createI18nWrapper("es");
    const { clientHtml, errors, serverHtml } = collectHydrationErrors(
      <I18n>
        <StoreShareButton title="Collar de perlas" url={URL_TO_SHARE} />
      </I18n>,
      { clientNowMs: 1000, serverNowMs: 0 }
    );

    expect(serverHtml).toMatch(/<button[^>]*disabled=""/u);
    expect(clientHtml).not.toMatch(/<button[^>]*disabled=""/u);
    expect(errors).toEqual([]);
  });
});
