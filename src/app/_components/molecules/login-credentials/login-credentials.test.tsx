import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import { reportError } from "@/lib/errors/client";
import type { Locale } from "@/lib/i18n/config";
import { renderWithI18n } from "@/test/i18n";

import { LoginCredentials } from "./login-credentials";

vi.mock("@/lib/errors/client", () => ({ reportError: vi.fn() }));

/**
 * `clipboard`: how the browser answers a write, or `missing` for a page
 * that has no clipboard at all.
 */
function setup({
  clipboard = "allowed",
  locale = "en",
}: {
  clipboard?: "allowed" | "broken" | "missing" | "refused";
  locale?: Locale;
} = {}) {
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
  renderWithI18n(
    <LoginCredentials
      className="custom"
      email="ana@example.com"
      password="temporal-123"
      signInPath={locale === "en" ? "/en/admin/sign-in" : "/admin/sign-in"}
    />,
    { locale }
  );

  return {
    copy: async () => {
      await user.click(
        screen.getByRole("button", {
          name: locale === "en" ? "Copy the details" : "Copiar los datos",
        })
      );
    },
    status: () => screen.getByRole("status"),
    writeText,
  };
}

const MESSAGE = `Dashboard: ${window.location.origin}/en/admin/sign-in\nEmail: ana@example.com\nTemporary password: temporal-123`;

describe("LoginCredentials", () => {
  test("shows the email and the temporary password", () => {
    setup();

    expect(screen.getByTestId("login-credentials-email")).toHaveTextContent(
      "ana@example.com"
    );
    expect(screen.getByTestId("login-credentials-password")).toHaveTextContent(
      "temporal-123"
    );
    expect(screen.getByTestId("login-credentials")).toHaveClass("custom");
  });

  test("copies the sign-in page's whole address, the email and the password, and says so politely", async () => {
    const { copy, status, writeText } = setup();

    expect(status()).toHaveTextContent(/^$/u);
    await copy();

    expect(writeText).toHaveBeenCalledExactlyOnceWith(MESSAGE);
    expect(status()).toHaveTextContent("Details copied.");
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  test.each([["refused"], ["missing"], ["broken"]] as const)(
    "with the clipboard %s, shows the same text to copy by hand, selected",
    async (clipboard) => {
      const { copy, status } = setup({ clipboard });

      await copy();

      const field = await screen.findByRole("textbox", {
        name: "We couldn't copy. Select the text above and copy it by hand.",
      });
      expect(field).toHaveValue(MESSAGE);
      expect(field).toHaveAttribute("readonly");
      expect(field).toHaveFocus();
      expect((field as HTMLTextAreaElement).selectionStart).toBe(0);
      expect((field as HTMLTextAreaElement).selectionEnd).toBe(MESSAGE.length);
      expect(status()).toHaveTextContent(/^$/u);
    }
  );

  test.each([["refused"], ["missing"]] as const)(
    "a clipboard %s by the browser's policy is no defect: nothing is reported",
    async (clipboard) => {
      const { copy } = setup({ clipboard });

      await copy();

      await screen.findByRole("textbox");
      expect(reportError).not.toHaveBeenCalled();
    }
  );

  test("a clipboard that fails otherwise is reported, once", async () => {
    const { copy } = setup({ clipboard: "broken" });

    await copy();

    await screen.findByRole("textbox");
    expect(reportError).toHaveBeenCalledExactlyOnceWith(
      new TypeError("Clipboard exploded"),
      { action: "Users.copy_credentials" }
    );
  });

  test("speaks Spanish, the message too", async () => {
    const { copy, status, writeText } = setup({ locale: "es" });

    await copy();

    expect(writeText).toHaveBeenCalledExactlyOnceWith(
      `Panel: ${window.location.origin}/admin/sign-in\nEmail: ana@example.com\nContraseña temporal: temporal-123`
    );
    expect(status()).toHaveTextContent("Datos copiados.");
    expect(screen.getByText("Contraseña temporal")).toBeInTheDocument();
  });
});
