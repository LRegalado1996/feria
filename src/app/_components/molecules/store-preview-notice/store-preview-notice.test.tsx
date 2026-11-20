import { screen, within } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import type { Locale } from "@/lib/i18n/config";
import { collectHydrationErrors } from "@/test/hydration";
import { createI18nWrapper, renderWithI18n } from "@/test/i18n";
import { required } from "@/test/required";

import { StorePreviewNotice } from "./store-preview-notice";

vi.mock("next/navigation", () => ({ usePathname: () => "/" }));

afterEach(() => {
  vi.restoreAllMocks();
});

/** The page's cookies as the browser hands them to a script. */
function stubCookies(cookies: string[]) {
  vi.spyOn(document, "cookie", "get").mockReturnValue(cookies.join("; "));
}

function setup({
  cookies = [],
  locale = "en",
}: { cookies?: string[]; locale?: Locale } = {}) {
  stubCookies(cookies);

  renderWithI18n(<StorePreviewNotice className="extra" />, { locale });

  return { notice: screen.queryByTestId("store-preview-notice") };
}

describe("StorePreviewNotice", () => {
  test.each([
    [
      "en",
      "The store is closed to the public. You see it because you are signed in.",
      "Manage the coming-soon page",
      "/en/admin/settings/coming-soon",
    ],
    [
      "es",
      "La tienda está cerrada al público. La ves porque iniciaste sesión.",
      "Administrar Próximamente",
      "/admin/settings/coming-soon",
    ],
  ] as const)(
    "in %s, on a page the proxy marked, says the store is closed and leads to the screen that opens it",
    (locale, message, link, href) => {
      const { notice } = setup({
        cookies: ["other=1", "lr-store-preview=1"],
        locale,
      });

      // An `output`: a status, announced as it appears.
      expect(notice?.tagName).toBe("OUTPUT");
      expect(notice).toHaveClass("extra", "bg-store-foreground");
      expect(within(required(notice)).getByText(message)).toBeVisible();
      expect(
        within(required(notice)).getByRole("link", { name: link })
      ).toHaveAttribute("href", href);
    }
  );

  test.each([
    ["en", "Store closed."],
    ["es", "Cerrada al público."],
  ] as const)(
    "in %s, a phone's eye gets the short notice on one row with the link, every reader the whole one",
    (locale, short) => {
      const { notice } = setup({ cookies: ["lr-store-preview=1"], locale });

      const visible = within(required(notice)).getByText(short);
      expect(visible).toHaveAttribute("aria-hidden", "true");
      expect(visible).toHaveClass("sm:hidden");
      expect(
        within(required(notice)).getByText(/^(The store|La tienda)/u)
      ).toHaveClass("max-sm:sr-only");
      // On a phone the row is about the link's own 44 px.
      expect(notice).toHaveClass("py-0.5");
      expect(notice).toHaveClass("sm:py-2");
    }
  );

  test.each([
    ["no cookie", []],
    ["other cookies only", ["other=1"]],
    ["a cookie that only starts alike", ["lr-store-preview-old=1"]],
    ["the cookie with another value", ["lr-store-preview=0"]],
  ])("with %s, shows nothing", (_case, cookies) => {
    const { notice } = setup({ cookies });

    expect(notice).not.toBeInTheDocument();
  });

  test("the server renders nothing, so the page is the same for every visitor, and hydrating shows it without a mismatch", () => {
    stubCookies(["lr-store-preview=1"]);
    const Wrapper = createI18nWrapper("es");

    const { clientHtml, errors, serverHtml } = collectHydrationErrors(
      <Wrapper>
        <StorePreviewNotice />
      </Wrapper>,
      { clientNowMs: 2000, serverNowMs: 1000 }
    );

    expect(serverHtml).not.toContain("store-preview-notice");
    expect(clientHtml).toContain("Administrar Próximamente");
    expect(errors).toEqual([]);
  });
});
