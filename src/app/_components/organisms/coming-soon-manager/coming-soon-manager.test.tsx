import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { describe, expect, test, vi } from "vitest";

import { Toaster } from "@/app/_components/molecules/sonner";
import { reportError } from "@/lib/errors/client";
import { comingSoonKey } from "@/lib/hooks/coming-soon";
import type { Locale } from "@/lib/i18n/config";
import { collectHydrationErrors } from "@/test/hydration";
import { createI18nWrapper, renderWithI18n } from "@/test/i18n";
import { createOrpcErrorHandler, createOrpcHandler, server } from "@/test/msw";

import { ComingSoonManager } from "./coming-soon-manager";

vi.mock("@/lib/orpc/client", async () => {
  const { orpcClientMock } = await import("@/test/mocks/orpc-client");
  return orpcClientMock;
});

vi.mock("@/lib/errors/client", () => ({ reportError: vi.fn() }));

const DEFAULTS = {
  en: {
    eyebrow: "Christmas fair",
    headline: "Opening\nsoon",
    lead: "Soon.",
    marquee: "Jewelry",
  },
  es: {
    eyebrow: "Feria navideña",
    headline: "Muy\npronto",
    lead: "Pronto.",
    marquee: "Bijou",
  },
};

function makePage(published: boolean) {
  return {
    countdownTo: "2026-12-20",
    published,
    translations: [
      {
        eyebrow: null,
        headline: "Abrimos",
        lead: null,
        locale: "es" as const,
        marquee: null,
      },
    ],
  };
}

const FAILURE = {
  code: "INTERNAL_SERVER_ERROR",
  message: "Internal server error",
  status: 500,
};

type Outcome = "fail" | "hang" | "ok";

/** A procedure that answers, fails, or never answers. */
function answer(
  path: string,
  spy: (input: unknown) => unknown,
  outcome: Outcome
) {
  if (outcome === "fail") {
    return createOrpcErrorHandler(path, FAILURE);
  }

  return createOrpcHandler(path, async (input) => {
    const output = spy(input);
    return outcome === "hang" ? await new Promise<never>(() => {}) : output;
  });
}

function setup({
  get = "ok",
  locale = "en",
  published = false,
  setPublished = "ok",
  update = "ok",
}: {
  get?: Outcome;
  locale?: Locale;
  published?: boolean;
  setPublished?: Outcome;
  update?: Outcome;
} = {}) {
  const spies = {
    get: vi.fn((_input: unknown) => makePage(published)),
    setPublished: vi.fn((input: unknown) => input),
    // The server answers the page as stored, its switch as it was.
    update: vi.fn((input: unknown) => ({ ...(input as object), published })),
  };
  server.use(
    answer("comingSoon.get", spies.get, get),
    answer("comingSoon.setPublished", spies.setPublished, setPublished),
    answer("comingSoon.update", spies.update, update)
  );
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });

  function Providers({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        {children}
        <Toaster />
      </QueryClientProvider>
    );
  }

  renderWithI18n(<ComingSoonManager defaults={DEFAULTS} />, {
    locale,
    wrapper: Providers,
  });

  return {
    queryClient,
    saveButton: () =>
      within(screen.getByTestId("admin-primary-action")).getByRole("button"),
    spies,
    state: () => screen.getByTestId("coming-soon-state"),
    status: () => screen.getByTestId("coming-soon-status"),
    user: userEvent.setup(),
  };
}

describe("ComingSoonManager", () => {
  test("shows a busy skeleton and no save button while the page loads", async () => {
    const { spies } = setup({ get: "hang" });

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      /^Coming soon$/u
    );
    expect(screen.getByTestId("coming-soon-skeleton")).toHaveAttribute(
      "aria-busy",
      "true"
    );
    expect(screen.queryByTestId("admin-primary-action")).toBeNull();
    await waitFor(() => {
      expect(spies.get).toHaveBeenCalledExactlyOnceWith(undefined);
    });
  });

  test("says the page failed to load, with nothing to change, and loads it again on retry", async () => {
    const { spies, user } = setup({ get: "fail" });

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      /^We could not load the coming-soon page\.Try again$/u
    );
    expect(screen.queryByTestId("coming-soon-status")).toBeNull();

    server.use(createOrpcHandler("comingSoon.get", spies.get));
    await user.click(within(alert).getByRole("button", { name: "Try again" }));

    expect(await screen.findByTestId("coming-soon-status")).toBeVisible();
  });

  test.each([
    [
      false,
      "Not published",
      "The store is open: the public sees all of it and this page does not show.",
      "Publish the page",
    ],
    [
      true,
      "Published",
      "The store is closed to the public: every address leads to this page. You still see it while signed in.",
      "Open the store",
    ],
  ])(
    "published %s, says the state in words and offers the one move it has",
    async (published, state, hint, move) => {
      const { status, state: chip } = setup({ published });
      await screen.findByTestId("coming-soon-status");

      expect(chip()).toHaveTextContent(new RegExp(`^${state}$`, "u"));
      expect(chip()).toHaveAttribute("data-published", String(published));
      expect(within(status()).getByText(hint)).toBeVisible();
      expect(
        within(status()).getByRole("button", { name: move })
      ).toBeEnabled();
    }
  );

  test.each([
    ["en", "Back to Settings", "/en/admin/settings"],
    ["es", "Volver a Ajustes", "/admin/settings"],
  ] as const)(
    "in %s, leads back to the settings it lives under",
    (locale, name, href) => {
      setup({ get: "hang", locale });

      expect(screen.getByRole("link", { name })).toHaveAttribute("href", href);
    }
  );

  test("links to the page itself in a new tab, in the admin's language, and says so to a screen reader", async () => {
    const { status } = setup({ locale: "es" });
    await screen.findByTestId("coming-soon-status");

    const link = within(status()).getByRole("link", {
      name: "Ver la página (se abre en otra pestaña)",
    });
    expect(link).toHaveAttribute("href", "/coming-soon");
    expect(link).toHaveAttribute("target", "_blank");
  });

  test("publishing asks first, and nothing changes until it is confirmed", async () => {
    const { spies, status, user } = setup();
    await screen.findByTestId("coming-soon-status");

    await user.click(
      within(status()).getByRole("button", { name: "Publish the page" })
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Publish the coming-soon page?",
    });
    expect(dialog).toHaveTextContent(
      "While it is published, the public sees nothing of the store"
    );

    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
    expect(spies.setPublished).not.toHaveBeenCalled();
  });

  test("a confirmed publish closes the store, says so, and shows the new state", async () => {
    const { queryClient, spies, state, status, user } = setup();
    await screen.findByTestId("coming-soon-status");

    await user.click(
      within(status()).getByRole("button", { name: "Publish the page" })
    );
    await user.click(
      within(await screen.findByRole("dialog")).getByRole("button", {
        name: "Yes, publish",
      })
    );

    expect(
      await screen.findByText(
        "Page published: the store is closed to the public."
      )
    ).toBeVisible();
    expect(spies.setPublished).toHaveBeenCalledExactlyOnceWith({
      published: true,
    });
    expect(state()).toHaveTextContent(/^Published$/u);
    expect(queryClient.getQueryData(comingSoonKey())).toMatchObject({
      published: true,
    });
    // Focus goes back to the control that asked.
    await waitFor(() => {
      expect(
        within(status()).getByRole("button", { name: "Open the store" })
      ).toHaveFocus();
    });
  });

  test("opening the store needs no confirmation: it hides nothing", async () => {
    const { spies, state, status, user } = setup({ published: true });
    await screen.findByTestId("coming-soon-status");

    await user.click(
      within(status()).getByRole("button", { name: "Open the store" })
    );

    expect(
      await screen.findByText("The store is open to the public.")
    ).toBeVisible();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(spies.setPublished).toHaveBeenCalledExactlyOnceWith({
      published: false,
    });
    expect(state()).toHaveTextContent(/^Not published$/u);
  });

  test("while the switch moves, its button says so, keeps the keyboard's focus and drops a second press", async () => {
    const { spies, status, user } = setup({
      published: true,
      setPublished: "hang",
    });
    await screen.findByTestId("coming-soon-status");
    const move = within(status()).getByRole("button", {
      name: "Open the store",
    });

    move.focus();
    await user.keyboard("{Enter}");

    await waitFor(() => {
      expect(move).toHaveAttribute("aria-disabled", "true");
    });
    expect(move).toHaveTextContent(/^Opening…$/u);
    // A natively disabled button drops focus to the page in a browser
    // (happy-dom keeps it), so it must stay enabled.
    expect(move).toBeEnabled();
    expect(move).toHaveFocus();

    await user.keyboard("{Enter}");
    await user.click(move);

    expect(move).toHaveFocus();
    expect(spies.setPublished).toHaveBeenCalledExactlyOnceWith({
      published: false,
    });
  });

  test("a failed flip is reported, said, and leaves the state as it was", async () => {
    const { state, status, user } = setup({
      published: true,
      setPublished: "fail",
    });
    await screen.findByTestId("coming-soon-status");

    await user.click(
      within(status()).getByRole("button", { name: "Open the store" })
    );

    expect(
      await screen.findByText(
        "We could not change the page's state. It is as it was: try again."
      )
    ).toBeVisible();
    expect(reportError).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ code: "INTERNAL_SERVER_ERROR" }),
      { action: "ComingSoon.set_published" }
    );
    expect(state()).toHaveTextContent(/^Published$/u);
  });

  test("saves the texts from the top bar's button, says so, and never touches the switch", async () => {
    const { saveButton, spies, user } = setup();
    await screen.findByTestId("coming-soon-form");
    await user.type(
      screen.getByRole("textbox", {
        name: "Text under the headline, in Spanish",
      }),
      "We open soon."
    );

    await user.click(saveButton());

    expect(await screen.findByText("Texts saved.")).toBeVisible();
    expect(spies.update).toHaveBeenCalledExactlyOnceWith({
      countdownTo: "2026-12-20",
      translations: [
        {
          eyebrow: null,
          headline: "Abrimos",
          lead: "We open soon.",
          locale: "es",
          marquee: null,
        },
        {
          eyebrow: null,
          headline: null,
          lead: null,
          locale: "en",
          marquee: null,
        },
      ],
    });
    expect(spies.setPublished).not.toHaveBeenCalled();
    expect(reportError).not.toHaveBeenCalled();
  });

  test("while saving, the button says so and cannot be pressed again", async () => {
    const { saveButton, user } = setup({ update: "hang" });
    await screen.findByTestId("coming-soon-form");

    await user.click(saveButton());

    await waitFor(() => {
      expect(saveButton()).toBeDisabled();
    });
    expect(saveButton()).toHaveTextContent(/^Saving…$/u);
  });

  test("a failed save is reported and said", async () => {
    const { saveButton, user } = setup({ update: "fail" });
    await screen.findByTestId("coming-soon-form");

    await user.click(saveButton());

    expect(
      await screen.findByText(
        "We could not save the texts. What you wrote is still here: try again."
      )
    ).toBeVisible();
    expect(reportError).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ code: "INTERNAL_SERVER_ERROR" }),
      { action: "ComingSoon.update_texts" }
    );
  });

  test("in Spanish, reads and flips in Spanish", async () => {
    const { state, status } = setup({ locale: "es" });
    await screen.findByTestId("coming-soon-status");

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      /^Próximamente$/u
    );
    expect(state()).toHaveTextContent(/^Sin publicar$/u);
    expect(
      within(status()).getByRole("button", { name: "Publicar la página" })
    ).toBeVisible();
  });

  test("cannot flip or save before it hydrates", () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(comingSoonKey(), makePage(false));
    const I18n = createI18nWrapper();
    const { clientHtml, errors, serverHtml } = collectHydrationErrors(
      <QueryClientProvider client={queryClient}>
        <I18n>
          <ComingSoonManager defaults={DEFAULTS} />
        </I18n>
      </QueryClientProvider>,
      { clientNowMs: 1000, serverNowMs: 0 }
    );
    const buttons = (html: string) => {
      const container = document.createElement("div");
      container.innerHTML = html;
      return [...container.querySelectorAll("button")]
        .filter((button) =>
          ["Publish the page", "Save texts"].includes(button.textContent)
        )
        .map((button) => [button.textContent, button.disabled]);
    };

    expect(buttons(serverHtml)).toEqual([
      ["Save texts", true],
      ["Publish the page", true],
    ]);
    expect(buttons(clientHtml)).toEqual([
      ["Save texts", false],
      ["Publish the page", false],
    ]);
    expect(errors).toEqual([]);
  });
});
