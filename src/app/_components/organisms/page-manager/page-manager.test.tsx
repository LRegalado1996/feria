import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { RequestHandler } from "msw";
import type { ReactNode } from "react";
import { describe, expect, test, vi } from "vitest";

import { Toaster } from "@/app/_components/molecules/sonner";
import { reportError } from "@/lib/errors/client";
import type { PageRow } from "@/lib/hooks/page";
import type { Locale } from "@/lib/i18n/config";
import { renderWithI18n } from "@/test/i18n";
import { createOrpcErrorHandler, createOrpcHandler, server } from "@/test/msw";
import { required } from "@/test/required";

import { PageManager } from "./page-manager";

vi.mock("@/lib/orpc/client", async () => {
  const { orpcClientMock } = await import("@/test/mocks/orpc-client");
  return orpcClientMock;
});

vi.mock("@/lib/errors/client", () => ({ reportError: vi.fn() }));

const { push } = vi.hoisted(() => ({ push: vi.fn<(href: string) => void>() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
}));

function makeRow(overrides: Partial<PageRow> = {}): PageRow {
  return {
    id: 2,
    isHome: false,
    isPublished: true,
    nameEn: "Christmas gifts",
    nameEs: "Regalos de Navidad",
    seoDescriptionEn: null,
    seoDescriptionEs: null,
    seoTitleEn: null,
    seoTitleEs: null,
    showInHeader: true,
    slug: "regalos",
    ...overrides,
  };
}

const ROWS: PageRow[] = [
  makeRow({
    id: 1,
    isHome: true,
    nameEn: "Home",
    nameEs: "Home",
    showInHeader: false,
    slug: "home",
  }),
  makeRow(),
  makeRow({
    id: 3,
    isPublished: false,
    nameEn: null,
    nameEs: "Ofertas",
    showInHeader: false,
    slug: "ofertas",
  }),
];

type Outcome = "conflict" | "fail" | "hang" | "ok";

/** A procedure that records its input, then answers, fails or never answers. */
function answer(
  path: string,
  spy: (input: unknown) => unknown,
  outcome: Outcome
): RequestHandler {
  if (outcome === "fail" || outcome === "conflict") {
    return createOrpcErrorHandler(
      path,
      outcome === "fail"
        ? {
            code: "INTERNAL_SERVER_ERROR",
            message: "Internal server error",
            status: 500,
          }
        : {
            code: "CONFLICT",
            message: "Another page or category already has that address",
            status: 409,
          }
    );
  }

  return createOrpcHandler(path, async (input) => {
    const output = spy(input);
    return outcome === "hang" ? await new Promise<never>(() => {}) : output;
  });
}

function setup({
  list = ROWS,
  locale = "en",
  writes = {},
}: {
  list?: PageRow[] | "fail" | "hang";
  locale?: Locale;
  writes?: Partial<Record<"create" | "delete" | "setHome", Outcome>>;
} = {}) {
  const spies = {
    create: vi.fn((_input: unknown) => ({ id: 9, slug: "navidad" })),
    delete: vi.fn((_input: unknown) => ({ id: 2, slug: "regalos" })),
    list: vi.fn((_input: unknown) => (Array.isArray(list) ? list : ROWS)),
    setHome: vi.fn((_input: unknown) => ({ homePageId: 2, previousHomeId: 1 })),
  };
  server.use(
    Array.isArray(list)
      ? createOrpcHandler("page.list", spies.list)
      : answer("page.list", spies.list, list === "fail" ? "fail" : "hang"),
    ...(["create", "delete", "setHome"] as const).map((name) =>
      answer(`page.${name}`, spies[name], writes[name] ?? "ok")
    )
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

  const user = userEvent.setup();
  renderWithI18n(<PageManager />, { locale, wrapper: Providers });
  const rows = async () => await screen.findAllByTestId("page-row");

  return { rows, spies, user };
}

describe("PageManager", () => {
  test("lists the home first and marked, then each page with its address, status and marks", async () => {
    const { rows } = setup();

    const [home, gifts, offers] = await rows();

    expect(home).toHaveAttribute("data-home", "true");
    expect(home).toHaveTextContent(/^Home\/HomePublished/u);
    expect(home).toHaveTextContent(
      "This page is the home: choose another one before deleting it."
    );
    // The home: no delete, no "Use as home", and no header mark.
    expect(
      within(required(home)).queryByRole("button", { name: /Delete/u })
    ).toBeNull();
    expect(
      within(required(home)).queryByRole("button", { name: /Use as home/u })
    ).toBeNull();
    expect(
      within(required(home)).getByRole("link", {
        name: "See on the store: Home (opens in a new tab)",
      })
    ).toHaveAttribute("href", "/en");
    expect(
      within(required(home)).getByRole("link", { name: "Edit: Home" })
    ).toHaveAttribute("href", "/en/admin/pages/1");

    expect(gifts).toHaveTextContent(
      /^Christmas gifts\/regalosPublishedIn the header/u
    );
    expect(
      within(required(gifts)).getByRole("link", {
        name: "See on the store: Christmas gifts (opens in a new tab)",
      })
    ).toHaveAttribute("href", "/en/regalos");

    // A draft: no view, no home, says why; named in Spanish without English.
    expect(offers).toHaveTextContent(/^Ofertas\/ofertasDraft/u);
    expect(offers).toHaveTextContent("Publish it to use it as the home.");
    expect(
      within(required(offers)).queryByRole("link", {
        name: /See on the store/u,
      })
    ).toBeNull();
    expect(
      within(required(offers)).queryByRole("button", { name: /Use as home/u })
    ).toBeNull();
  });

  test("in Spanish, names each page in Spanish, under Spanish addresses", async () => {
    const { rows } = setup({ locale: "es" });

    const [, gifts] = await rows();

    expect(
      within(required(gifts)).getByRole("link", {
        name: "Editar: Regalos de Navidad",
      })
    ).toHaveAttribute("href", "/admin/pages/2");
  });

  test("a store with no page says so", async () => {
    setup({ list: [] });

    expect(await screen.findByText("No pages yet.")).toBeInTheDocument();
  });

  test("waits on a skeleton, then says a failed load and loads again on retry", async () => {
    const { spies, user } = setup({ list: "fail" });

    expect(screen.getByTestId("page-manager-skeleton")).toHaveAttribute(
      "aria-busy",
      "true"
    );
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("We could not load the pages.");

    server.use(createOrpcHandler("page.list", spies.list));
    await user.click(within(alert).getByRole("button", { name: "Try again" }));

    expect(await screen.findAllByTestId("page-row")).toHaveLength(3);
    expect(spies.list).toHaveBeenCalledOnce();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  test("creates a page from the side sheet, then opens its editor", async () => {
    const { spies, user } = setup();
    await waitForRows();

    await user.click(screen.getByTestId("page-add"));
    const sheet = await screen.findByTestId("page-sheet");
    await user.type(
      within(sheet).getByRole("textbox", { name: "Name in Spanish" }),
      "Navidad"
    );
    await user.click(within(sheet).getByTestId("page-form-submit"));

    await waitFor(() => {
      expect(push).toHaveBeenCalledExactlyOnceWith("/en/admin/pages/9");
    });
    expect(spies.create).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ nameEs: "Navidad", slug: "navidad" })
    );
    expect(await screen.findByText("Page created.")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByTestId("page-sheet")).toBeNull();
    });
  });

  test("an address taken stays in the sheet, said under the address, reported to no one", async () => {
    const { user } = setup({ writes: { create: "conflict" } });
    await waitForRows();

    await user.click(screen.getByTestId("page-add"));
    const sheet = await screen.findByTestId("page-sheet");
    await user.type(
      within(sheet).getByRole("textbox", { name: "Name in Spanish" }),
      "Regalos"
    );
    await user.click(within(sheet).getByTestId("page-form-submit"));

    expect(
      await within(sheet).findByText(
        "Another page or a category already has that address."
      )
    ).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
    expect(reportError).not.toHaveBeenCalled();
  });

  test("a failed creation is reported and said in the sheet", async () => {
    const { user } = setup({ writes: { create: "fail" } });
    await waitForRows();

    await user.click(screen.getByTestId("page-add"));
    const sheet = await screen.findByTestId("page-sheet");
    await user.type(
      within(sheet).getByRole("textbox", { name: "Name in Spanish" }),
      "Regalos"
    );
    await user.click(within(sheet).getByTestId("page-form-submit"));

    expect(await within(sheet).findByRole("alert")).toHaveTextContent(
      /We could not save the page/u
    );
    expect(reportError).toHaveBeenCalledExactlyOnceWith(expect.anything(), {
      action: "Pages.create_page",
    });
  });

  test("cancel closes the sheet and focus goes back to “New page”", async () => {
    const { user } = setup();
    await waitForRows();

    await user.click(screen.getByTestId("page-add"));
    const sheet = await screen.findByTestId("page-sheet");
    await user.click(within(sheet).getByRole("button", { name: "Cancel" }));

    await waitFor(() => {
      expect(screen.getByTestId("page-add")).toHaveFocus();
    });
  });

  test("the sheet's close button closes it, creating nothing", async () => {
    const { spies, user } = setup();
    await waitForRows();

    await user.click(screen.getByTestId("page-add"));
    const sheet = await screen.findByTestId("page-sheet");
    await user.click(within(sheet).getByRole("button", { name: "Close" }));

    await waitFor(() => {
      expect(screen.queryByTestId("page-sheet")).toBeNull();
    });
    expect(spies.create).not.toHaveBeenCalled();
  });

  test("makes a published page the home after asking, then says so", async () => {
    const { rows, spies, user } = setup();
    const [, gifts] = await rows();

    await user.click(
      within(required(gifts)).getByRole("button", {
        name: "Use as home: Christmas gifts",
      })
    );
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Use “Christmas gifts” as the home?");
    expect(dialog).toHaveTextContent(
      "The store will show “Christmas gifts” at “/”. The current home goes back to its own address."
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Use as home" })
    );

    expect(
      await screen.findByText("“Christmas gifts” is the home.")
    ).toBeInTheDocument();
    expect(spies.setHome).toHaveBeenCalledExactlyOnceWith({ pageId: 2 });
  });

  test("a refused choice of the home is reported and said", async () => {
    const { rows, user } = setup({ writes: { setHome: "fail" } });
    const [, gifts] = await rows();

    await user.click(
      within(required(gifts)).getByRole("button", { name: /Use as home/u })
    );
    await user.click(
      within(await screen.findByRole("dialog")).getByRole("button", {
        name: "Use as home",
      })
    );

    expect(
      await screen.findByText("We could not change the home. Try again.")
    ).toBeInTheDocument();
    expect(reportError).toHaveBeenCalledExactlyOnceWith(expect.anything(), {
      action: "Pages.set_home",
    });
  });

  test("deletes a page after asking, then says so", async () => {
    const { rows, spies, user } = setup();
    const [, gifts] = await rows();

    await user.click(
      within(required(gifts)).getByRole("button", {
        name: "Delete: Christmas gifts",
      })
    );
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent(
      "“Christmas gifts” is deleted with its blocks."
    );
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));

    expect(await screen.findByText("Page deleted.")).toBeInTheDocument();
    expect(spies.delete).toHaveBeenCalledExactlyOnceWith({ id: 2 });
  });

  test("a failed deletion is reported and said", async () => {
    const { rows, user } = setup({ writes: { delete: "fail" } });
    const [, gifts] = await rows();

    await user.click(
      within(required(gifts)).getByRole("button", { name: /Delete/u })
    );
    await user.click(
      within(await screen.findByRole("dialog")).getByRole("button", {
        name: "Delete",
      })
    );

    expect(
      await screen.findByText("We could not delete the page. Try again.")
    ).toBeInTheDocument();
    expect(reportError).toHaveBeenCalledExactlyOnceWith(expect.anything(), {
      action: "Pages.delete_page",
    });
  });

  test("dismissing a question changes nothing and focus goes back to its button", async () => {
    const { rows, spies, user } = setup();
    const [, gifts] = await rows();
    const button = within(required(gifts)).getByRole("button", {
      name: /Delete/u,
    });

    await user.click(button);
    await screen.findByRole("dialog");
    await user.keyboard("{Escape}");

    await waitFor(() => {
      expect(button).toHaveFocus();
    });
    expect(spies.delete).not.toHaveBeenCalled();

    await user.click(
      within(required(gifts)).getByRole("button", { name: /Use as home/u })
    );
    await screen.findByRole("dialog");
    await user.keyboard("{Escape}");

    expect(spies.setHome).not.toHaveBeenCalled();
  });
});

/** Waits for the list, so the screen is past its skeleton. */
async function waitForRows() {
  await screen.findAllByTestId("page-row");
}
