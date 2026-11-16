import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import { reportError } from "@/lib/errors/client";
import type { Locale } from "@/lib/i18n/config";
import { renderWithI18n } from "@/test/i18n";

import StoreError from "./error";

vi.mock("@/lib/errors/client", () => ({ reportError: vi.fn() }));

function setup({ locale = "en" }: { locale?: Locale } = {}) {
  const error = new Error("render failed");
  const retry = vi.fn<() => void>();
  const view = renderWithI18n(<StoreError error={error} retry={retry} />, {
    locale,
  });

  return { error, retry, user: userEvent.setup(), view };
}

describe("StoreError", () => {
  test("reports the failure once, with its action", () => {
    const { error, view } = setup();

    view.rerender(<StoreError error={error} retry={vi.fn<() => void>()} />);

    expect(reportError).toHaveBeenCalledExactlyOnceWith(error, {
      action: "Storefront.render_failed",
    });
  });

  test.each([
    [
      "en",
      "We could not show this page",
      "Something failed while showing this page. Try again; if it keeps happening, write to us.",
      "Try again",
    ],
    [
      "es",
      "No pudimos mostrar esta página",
      "Algo falló al mostrar esta página. Probá de nuevo; si sigue pasando, escribinos.",
      "Probar de nuevo",
    ],
  ] as const)(
    "in %s, says so and offers to try again",
    async (locale, title, body, label) => {
      const { retry, user } = setup({ locale });

      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
        new RegExp(`^${title}$`, "u")
      );
      expect(screen.getByRole("alert").textContent).toBe(body);
      await user.click(screen.getByRole("button", { name: label }));

      expect(retry.mock.calls).toEqual([[]]);
    }
  );
});
