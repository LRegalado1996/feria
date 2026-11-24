import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { describe, expect, test, vi } from "vitest";

import { Toaster } from "@/app/_components/molecules/sonner";
import { reportError } from "@/lib/errors/client";
import { storeSettingsKey } from "@/lib/hooks/store";
import type { Locale } from "@/lib/i18n/config";
import { collectHydrationErrors } from "@/test/hydration";
import { createI18nWrapper, renderWithI18n } from "@/test/i18n";
import { createOrpcErrorHandler, createOrpcHandler, server } from "@/test/msw";

import { SettingsManager } from "./settings-manager";

vi.mock("@/lib/orpc/client", async () => {
  const { orpcClientMock } = await import("@/test/mocks/orpc-client");
  return orpcClientMock;
});

vi.mock("@/lib/errors/client", () => ({ reportError: vi.fn() }));

const STORE = {
  currencyCode: "UYU" as const,
  id: 7,
  instagramUrl: "https://instagram.com/sample",
  name: "Sample Store",
  tiktokUrl: null,
  translations: [
    {
      description: "Anillos y cadenas.",
      locale: "es" as const,
      location: null,
      tagline: "Hola",
    },
    {
      description: "Rings and chains.",
      locale: "en" as const,
      location: null,
      tagline: "Hello",
    },
  ],
  whatsappNumber: "+59899123456",
};

const FAILURE = {
  code: "INTERNAL_SERVER_ERROR",
  message: "Internal server error",
  status: 500,
};

/** A procedure that answers, fails, or never answers. */
function answer(
  path: string,
  spy: (input: unknown) => unknown,
  outcome: "fail" | "hang" | "ok"
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
  update = "ok",
}: {
  get?: "fail" | "hang" | "ok";
  locale?: Locale;
  update?: "fail" | "hang" | "ok";
} = {}) {
  const spies = {
    get: vi.fn((_input: unknown) => STORE),
    // The server answers the store as stored.
    update: vi.fn((input: unknown) => ({
      ...(input as object),
      currencyCode: STORE.currencyCode,
      id: 7,
    })),
  };
  server.use(
    answer("store.get", spies.get, get),
    answer("store.update", spies.update, update)
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

  renderWithI18n(<SettingsManager />, { locale, wrapper: Providers });
  const user = userEvent.setup();

  return {
    field: (name: string) => screen.getByRole("textbox", { name }),
    queryClient,
    saveButton: () =>
      within(screen.getByTestId("admin-primary-action")).getByRole("button"),
    spies,
    user,
  };
}

/** The save button in an HTML string: the top bar's submit button. */
function saveButtonIn(html: string) {
  const container = document.createElement("div");
  container.innerHTML = html;
  return container.querySelector('button[type="submit"]');
}

describe("SettingsManager", () => {
  test("shows a busy skeleton and no save button while the store loads", async () => {
    const { spies } = setup({ get: "hang" });

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      /^Settings$/u
    );
    const skeleton = screen.getByTestId("settings-skeleton");
    expect(skeleton).toHaveAttribute("aria-busy", "true");
    expect(skeleton).toHaveTextContent(/^Loading$/u);
    expect(screen.queryByTestId("admin-primary-action")).toBeNull();
    expect(screen.queryByTestId("settings-form")).toBeNull();
    await waitFor(() => {
      expect(spies.get).toHaveBeenCalledExactlyOnceWith(undefined);
    });
  });

  test("a refresh that fails behind a loaded form says nothing: the form it has still works", async () => {
    const { queryClient } = setup();
    await screen.findByTestId("settings-form");
    server.use(createOrpcErrorHandler("store.get", FAILURE));

    await act(async () => {
      await queryClient.refetchQueries();
      // The query tells its screen on the next tick: without waiting for
      // it, the screen below would still be the one from before the failure.
      await new Promise((resolve) => {
        setTimeout(resolve, 0);
      });
    });

    expect(queryClient.getQueryState(storeSettingsKey())?.status).toBe("error");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByTestId("settings-form")).toBeInTheDocument();
  });

  test("says the settings failed to load, with no form to save, and loads them again on retry", async () => {
    const { field, spies, user } = setup({ get: "fail" });

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      /^We couldn't load the settings\.Try again$/u
    );
    expect(screen.queryByTestId("settings-form")).toBeNull();
    expect(screen.queryByTestId("admin-primary-action")).toBeNull();

    server.use(createOrpcHandler("store.get", spies.get));
    await user.click(within(alert).getByRole("button", { name: "Try again" }));

    await screen.findByTestId("settings-form");
    expect(field("Store name")).toHaveValue("Sample Store");
    expect(screen.queryByText(/load the settings/u)).toBeNull();
  });

  test("saves from the top bar's button, says so, and shows what was stored", async () => {
    const { field, queryClient, saveButton, spies, user } = setup();
    await screen.findByTestId("settings-form");
    await user.clear(field("WhatsApp number"));
    await user.type(field("WhatsApp number"), "098 765 432");

    await user.click(saveButton());

    expect(await screen.findByText("Settings saved.")).toBeVisible();
    expect(spies.update).toHaveBeenCalledExactlyOnceWith({
      instagramUrl: "https://instagram.com/sample",
      name: "Sample Store",
      tiktokUrl: null,
      translations: STORE.translations,
      whatsappNumber: "+59898765432",
    });
    expect(field("WhatsApp number")).toHaveValue("+59898765432");
    expect(queryClient.getQueryData(storeSettingsKey())).toMatchObject({
      whatsappNumber: "+59898765432",
    });
    expect(reportError).not.toHaveBeenCalled();
  });

  test("while saving, the button says so and cannot be pressed again", async () => {
    const { saveButton, spies, user } = setup({ update: "hang" });
    await screen.findByTestId("settings-form");
    expect(saveButton()).toHaveTextContent(/^Save$/u);

    await user.click(saveButton());

    await waitFor(() => {
      expect(saveButton()).toBeDisabled();
    });
    expect(saveButton()).toHaveTextContent(/^Saving…$/u);
    expect(spies.update).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ name: "Sample Store" })
    );
  });

  test("a failed save is reported, said, and keeps what was typed", async () => {
    const { field, saveButton, user } = setup({ update: "fail" });
    await screen.findByTestId("settings-form");
    await user.clear(field("Tagline in Spanish"));
    await user.type(field("Tagline in Spanish"), "Texto nuevo");

    await user.click(saveButton());

    expect(
      await screen.findByText(
        "We couldn't save the settings. What you wrote is still here: try again."
      )
    ).toBeVisible();
    expect(reportError).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ code: "INTERNAL_SERVER_ERROR" }),
      { action: "Store.update_settings" }
    );
    expect(field("Tagline in Spanish")).toHaveValue("Texto nuevo");
    expect(screen.queryByText("Settings saved.")).toBeNull();
    expect(saveButton()).toBeEnabled();
  });

  test.each([
    [
      "en",
      "Coming soon",
      "Manage the coming-soon page",
      "/en/admin/settings/coming-soon",
    ],
    [
      "es",
      "Próximamente",
      "Administrar Próximamente",
      "/admin/settings/coming-soon",
    ],
  ] as const)(
    "in %s, leads to the coming-soon page's screen from a card of its own, whatever the settings' state",
    (locale, title, link, href) => {
      setup({ get: "hang", locale });
      const card = screen.getByTestId("settings-coming-soon");

      expect(
        within(card).getByRole("heading", { level: 2, name: title })
      ).toBeVisible();
      expect(within(card).getByRole("link", { name: link })).toHaveAttribute(
        "href",
        href
      );
    }
  );

  test("in Spanish, reads and saves in Spanish", async () => {
    const { saveButton, user } = setup({ locale: "es" });
    await screen.findByTestId("settings-form");

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      /^Ajustes$/u
    );
    expect(saveButton()).toHaveTextContent(/^Guardar$/u);
    await user.click(saveButton());

    expect(await screen.findByText("Ajustes guardados.")).toBeVisible();
  });

  test("cannot save before it hydrates: the browser would put the settings in the address", () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(storeSettingsKey(), STORE);
    const I18n = createI18nWrapper();
    const { clientHtml, errors, serverHtml } = collectHydrationErrors(
      <QueryClientProvider client={queryClient}>
        <I18n>
          <SettingsManager />
        </I18n>
      </QueryClientProvider>,
      { clientNowMs: 1000, serverNowMs: 0 }
    );

    expect(saveButtonIn(serverHtml)).toHaveProperty("disabled", true);
    expect(saveButtonIn(clientHtml)).toHaveProperty("disabled", false);
    expect(errors).toEqual([]);
  });
});
