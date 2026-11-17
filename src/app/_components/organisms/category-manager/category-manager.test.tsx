import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http, type RequestHandler } from "msw";
import type { ReactNode } from "react";
import { describe, expect, test, vi } from "vitest";

import { Toaster } from "@/app/_components/molecules/sonner";
import { reportError } from "@/lib/errors/client";
import type { Locale } from "@/lib/i18n/config";
import { renderWithI18n } from "@/test/i18n";
import { createOrpcErrorHandler, createOrpcHandler, server } from "@/test/msw";

import { CategoryManager } from "./category-manager";

vi.mock("@/lib/orpc/client", async () => {
  const { orpcClientMock } = await import("@/test/mocks/orpc-client");
  return orpcClientMock;
});

vi.mock("@/lib/errors/client", () => ({ reportError: vi.fn() }));

function makeRow(
  id: number,
  nameEs: string,
  overrides: Partial<{
    nameEn: string | null;
    position: number;
    productCount: number;
  }> = {}
) {
  return {
    id,
    nameEn: null,
    nameEs,
    position: id - 1,
    productCount: 0,
    slug: nameEs.toLowerCase(),
    ...overrides,
  };
}

type Row = ReturnType<typeof makeRow>;

const ROWS: Row[] = [
  makeRow(1, "Collares", { nameEn: "Necklaces", productCount: 1 }),
  makeRow(2, "Aros", { productCount: 3 }),
  makeRow(3, "Pulseras"),
];

const FAILURE = {
  code: "INTERNAL_SERVER_ERROR",
  message: "Internal server error",
  status: 500,
};

/** A procedure that records its input, then answers, fails or never answers. */
function answer(
  path: string,
  spy: (input: unknown) => unknown,
  outcome: "fail" | "hang" | "ok"
): RequestHandler {
  if (outcome === "fail") {
    return createOrpcErrorHandler(path, FAILURE);
  }

  return createOrpcHandler(path, async (input) => {
    const output = spy(input);
    return outcome === "hang" ? await new Promise<never>(() => {}) : output;
  });
}

interface SetupOptions {
  /** `category.list`'s first answer: rows, a failure, or nothing yet. */
  list?: Row[] | "fail" | "hang";
  locale?: Locale;
  /** How each write ends. */
  writes?: Partial<
    Record<"create" | "delete" | "rename" | "reorder", "fail" | "hang" | "ok">
  >;
}

function setup({ list = ROWS, locale = "en", writes = {} }: SetupOptions = {}) {
  const spies = {
    create: vi.fn((_input: unknown) => ({
      id: 9,
      position: 3,
      slug: "anillos",
    })),
    delete: vi.fn((_input: unknown) => ({ id: 2, movedArticles: 3 })),
    list: vi.fn((_input: unknown) => (Array.isArray(list) ? list : ROWS)),
    rename: vi.fn((_input: unknown) => ({ id: 1, slug: "collares" })),
    reorder: vi.fn((input: unknown) => input),
  };
  server.use(
    Array.isArray(list)
      ? createOrpcHandler("category.list", spies.list)
      : answer("category.list", spies.list, list === "fail" ? "fail" : "hang"),
    ...(["create", "delete", "rename", "reorder"] as const).map((name) =>
      answer(`category.${name}`, spies[name], writes[name] ?? "ok")
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
  renderWithI18n(<CategoryManager />, {
    locale,
    wrapper: Providers,
  });

  const row = (slug: string) => screen.getByTestId(`category-row-${slug}`);
  /** The Spanish names in the list, top to bottom. */
  const order = () =>
    within(screen.getByTestId("category-list"))
      .getAllByRole("listitem")
      .map((item) => item.querySelector("p")?.textContent);

  /** Gives each row its own place, 60px apart: happy-dom lays nothing out. */
  const layOut = (slugs: string[]) => {
    for (const [index, slug] of slugs.entries()) {
      vi.spyOn(row(slug), "getBoundingClientRect").mockReturnValue(
        DOMRect.fromRect({ height: 56, width: 400, x: 0, y: index * 60 })
      );
    }
  };

  return { layOut, order, queryClient, row, spies, user };
}

/** The manager's own live region; dnd-kit adds another `status` of its own. */
function announcer() {
  return screen
    .getAllByRole("status")
    .find((region) => region.tagName === "OUTPUT");
}

/** dnd-kit's live region, which says what a drag is doing. */
function dragAnnouncer() {
  return screen
    .getAllByRole("status")
    .find((region) => region.tagName !== "OUTPUT");
}

async function shown() {
  await screen.findByTestId("category-list");
}

describe("CategoryManager", () => {
  test("shows a busy skeleton while the list loads", async () => {
    const { spies } = setup({ list: "hang" });

    const skeleton = screen.getByTestId("category-list-skeleton");
    expect(skeleton).toHaveAttribute("aria-busy", "true");
    expect(skeleton).toHaveTextContent(/^Loading$/u);
    expect(screen.queryByTestId("category-list")).toBeNull();
    await waitFor(() => {
      expect(spies.list).toHaveBeenCalledExactlyOnceWith(undefined);
    });
  });

  test("says the list failed to load and loads it again on retry", async () => {
    const { spies, user } = setup({ list: "fail" });

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      /^We could not load the categories\.Try again$/u
    );
    expect(screen.queryByTestId("empty-state")).toBeNull();

    server.use(createOrpcHandler("category.list", spies.list));
    await user.click(within(alert).getByRole("button", { name: "Try again" }));

    await shown();
    expect(spies.list).toHaveBeenCalledExactlyOnceWith(undefined);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  test("invites adding the first category when the store has none", async () => {
    setup({ list: [] });

    expect(await screen.findByTestId("empty-state")).toHaveTextContent(
      "No categories yet. Add the first one above."
    );
    expect(screen.queryByTestId("category-list")).toBeNull();
  });

  test("lists each category with its English name and article count", async () => {
    const { order, row, spies } = setup();
    await shown();

    expect(order()).toEqual(["Collares", "Aros", "Pulseras"]);
    expect(row("collares")).toHaveTextContent("CollaresNecklaces · 1 article");
    expect(within(row("collares")).getByText("Necklaces ·")).toHaveAttribute(
      "lang",
      "en"
    );
    expect(row("aros")).toHaveTextContent(/^Aros3 articles$/u);
    expect(row("pulseras")).toHaveTextContent(/^Pulseras0 articles$/u);
    expect(spies.list).toHaveBeenCalledExactlyOnceWith(undefined);
  });

  test("is a stack of cards on a phone, and one card of rows from md up", async () => {
    const { row } = setup();
    await shown();

    expect(row("aros")).toHaveClass(
      "rounded-lg",
      "border",
      "bg-card",
      "md:rounded-none",
      "md:border-0"
    );
    expect(screen.getByTestId("category-list")).toHaveClass(
      "space-y-2",
      "md:divide-y",
      "md:rounded-lg",
      "md:border"
    );
    // The name takes the first line on a phone; the buttons, the next.
    expect(
      within(row("aros")).getByTestId("category-name").parentElement
    ).toHaveClass("basis-[calc(100%-3.25rem)]", "md:basis-0");
  });

  test("names every row's controls after its category", async () => {
    const { row } = setup();
    await shown();

    expect(
      within(row("aros"))
        .getAllByRole("button")
        .map((button) => button.getAttribute("aria-label"))
    ).toEqual([
      "Drag to reorder: Aros",
      "Move up: Aros",
      "Move down: Aros",
      "Rename: Aros",
      "Delete: Aros",
    ]);
  });

  test("heads the screen with its title and its main action, which takes focus to the add form", async () => {
    const { user } = setup();
    await shown();
    const form = screen.getByRole("heading", {
      level: 2,
      name: "New category",
    }).parentElement;
    const scrolled = vi.spyOn(form ?? document.body, "scrollIntoView");

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      /^Categories$/u
    );
    await user.click(screen.getByRole("button", { name: "New category" }));

    expect(scrolled).toHaveBeenCalledExactlyOnceWith({ block: "start" });
    expect(screen.getByLabelText(/^Name in Spanish/u)).toHaveFocus();
  });

  test("adds a category and reads the list again", async () => {
    const { spies, user } = setup();
    await shown();

    await user.type(screen.getByLabelText(/^Name in Spanish/u), "Anillos");
    await user.click(screen.getByRole("button", { name: "Add" }));

    expect(await screen.findByText("Category added.")).toBeVisible();
    expect(spies.create).toHaveBeenCalledExactlyOnceWith({
      nameEn: null,
      nameEs: "Anillos",
    });
    await waitFor(() => {
      expect(spies.list.mock.calls).toEqual([[undefined], [undefined]]);
    });
    expect(screen.getByLabelText(/^Name in Spanish/u)).toHaveValue("");
  });

  test("locks the add form while the category is being added", async () => {
    const { spies, user } = setup({ writes: { create: "hang" } });
    await shown();
    const spanish = screen.getByLabelText(/^Name in Spanish/u);

    await user.type(spanish, "Anillos");
    await user.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => {
      expect(spanish).toBeDisabled();
    });
    await user.type(spanish, " de oro");
    expect(spanish).toHaveValue("Anillos");
    expect(screen.getByRole("button", { name: "Adding…" })).toBeDisabled();
    await waitFor(() => {
      expect(spies.create).toHaveBeenCalledExactlyOnceWith({
        nameEn: null,
        nameEs: "Anillos",
      });
    });
  });

  test("keeps the delete dialog open, with no toast, until the deletion is answered", async () => {
    const { row, spies, user } = setup({ writes: { delete: "hang" } });
    await shown();

    await user.click(
      within(row("pulseras")).getByRole("button", { name: "Delete: Pulseras" })
    );
    const dialog = await screen.findByTestId("delete-category-dialog");
    await user.click(
      within(dialog).getByRole("button", { name: "Delete category" })
    );

    await waitFor(() => {
      expect(spies.delete).toHaveBeenCalledExactlyOnceWith({
        id: 3,
        moveToId: null,
      });
    });
    expect(
      await within(dialog).findByRole("button", { name: "Deleting…" })
    ).toBeDisabled();
    expect(screen.getByTestId("delete-category-dialog")).toBe(dialog);
    expect(screen.queryByText("Category deleted.")).toBeNull();
  });

  test("puts a name the store already has on the Spanish field, without reporting it", async () => {
    const { user } = setup();
    server.use(
      createOrpcErrorHandler("category.create", {
        code: "CONFLICT",
        message: "Another category of this store already has that name",
        status: 409,
      })
    );
    await shown();
    const spanish = screen.getByLabelText(/^Name in Spanish/u);

    await user.type(spanish, "Collares");
    await user.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => {
      expect(spanish).toHaveAttribute("aria-invalid", "true");
    });
    expect(spanish).toHaveAccessibleDescription(
      "This store already has a category with that name."
    );
    expect(spanish).toHaveValue("Collares");
    expect(reportError).not.toHaveBeenCalled();
  });

  test("reports a failed addition and says it failed", async () => {
    const { user } = setup({ writes: { create: "fail" } });
    await shown();

    await user.type(screen.getByLabelText(/^Name in Spanish/u), "Anillos");
    await user.click(screen.getByRole("button", { name: "Add" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /^We could not save the change\. Try again\.$/u
    );
    expect(reportError).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ code: "INTERNAL_SERVER_ERROR" }),
      { action: "Category.create" }
    );
  });

  test("renames a category in place, then closes its form", async () => {
    const { row, spies, user } = setup();
    await shown();

    await user.click(
      within(row("collares")).getByRole("button", { name: "Rename: Collares" })
    );
    const form = within(row("collares"));
    expect(form.getByLabelText(/^Name in Spanish/u)).toHaveValue("Collares");
    expect(form.getByLabelText("Name in English (optional)")).toHaveValue(
      "Necklaces"
    );
    await user.clear(form.getByLabelText("Name in English (optional)"));
    await user.click(form.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Category renamed.")).toBeVisible();
    expect(spies.rename).toHaveBeenCalledExactlyOnceWith({
      id: 1,
      nameEn: null,
      nameEs: "Collares",
    });
    await waitFor(() => {
      expect(within(row("collares")).queryByRole("textbox")).toBeNull();
    });
  });

  test("cancelling a rename puts the row back as it was", async () => {
    const { row, spies, user } = setup();
    await shown();

    await user.click(
      within(row("aros")).getByRole("button", { name: "Rename: Aros" })
    );
    await user.click(
      within(row("aros")).getByRole("button", { name: "Cancel" })
    );

    expect(row("aros")).toHaveTextContent(/^Aros3 articles$/u);
    expect(spies.rename).not.toHaveBeenCalled();
  });

  test("reports a failed rename and keeps its form open", async () => {
    const { row, user } = setup({ writes: { rename: "fail" } });
    await shown();

    await user.click(
      within(row("aros")).getByRole("button", { name: "Rename: Aros" })
    );
    await user.click(within(row("aros")).getByRole("button", { name: "Save" }));

    expect(await within(row("aros")).findByRole("alert")).toHaveTextContent(
      /^We could not save the change\. Try again\.$/u
    );
    expect(within(row("aros")).getByLabelText(/^Name in Spanish/u)).toHaveValue(
      "Aros"
    );
    expect(reportError).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ code: "INTERNAL_SERVER_ERROR" }),
      { action: "Category.rename" }
    );
  });

  test("the first row cannot move up and the last cannot move down", async () => {
    const { row } = setup();
    await shown();

    expect(
      within(row("collares")).getByRole("button", { name: "Move up: Collares" })
    ).toBeDisabled();
    expect(
      within(row("collares")).getByRole("button", {
        name: "Move down: Collares",
      })
    ).toBeEnabled();
    expect(
      within(row("pulseras")).getByRole("button", { name: "Move up: Pulseras" })
    ).toBeEnabled();
    expect(
      within(row("pulseras")).getByRole("button", {
        name: "Move down: Pulseras",
      })
    ).toBeDisabled();
  });

  test.each([
    [
      "down",
      "collares",
      "Collares",
      [2, 1, 3],
      "“Collares” is now in place 2 of 3.",
    ],
    [
      "up",
      "pulseras",
      "Pulseras",
      [1, 3, 2],
      "“Pulseras” is now in place 2 of 3.",
    ],
  ])(
    "moving a row %s saves the new order at once and announces it",
    async (direction, slug, name, ids, announcement) => {
      const { order, row, spies, user } = setup({
        writes: { reorder: "hang" },
      });
      await shown();

      await user.click(
        within(row(slug)).getByRole("button", {
          name: `Move ${direction}: ${name}`,
        })
      );

      await waitFor(() => {
        expect(order()).toEqual(
          ids.map((id) => ROWS.find((candidate) => candidate.id === id)?.nameEs)
        );
      });
      expect(announcer()).toHaveTextContent(announcement);
      expect(announcer()).toHaveAttribute("aria-live", "polite");
      await waitFor(() => {
        expect(spies.reorder).toHaveBeenCalledExactlyOnceWith({
          ids,
        });
      });
    }
  );

  test("reports a failed reorder, says so and puts the order back", async () => {
    const { order, row, user } = setup({ writes: { reorder: "fail" } });
    await shown();

    await user.click(
      within(row("collares")).getByRole("button", {
        name: "Move down: Collares",
      })
    );

    // The move it announced did not happen: the live region says so, and a
    // toast says it too.
    await waitFor(() => {
      expect(announcer()).toHaveTextContent(
        /^We could not save the change\. Try again\.$/u
      );
    });
    expect(
      screen
        .getAllByText("We could not save the change. Try again.")
        .find((node) => node.closest("output") === null)
    ).toBeVisible();
    expect(reportError).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ code: "INTERNAL_SERVER_ERROR" }),
      { action: "Category.reorder" }
    );
    await waitFor(() => {
      expect(order()).toEqual(["Collares", "Aros", "Pulseras"]);
    });
  });

  test("reports a failed first move once, after a second move made while it was in flight", async () => {
    const { order, row, user } = setup();
    const received: unknown[] = [];
    let failFirst: () => void = () => undefined;
    const firstHeld = new Promise<void>((resolve) => {
      failFirst = resolve;
    });
    // The first save is held, then fails; the next goes through.
    server.use(
      http.post<never, { json?: unknown }>(
        "*/api/orpc/category/reorder",
        async ({ request }) => {
          const { json } = await request.json();
          received.push(json);

          if (received.length > 1) {
            return HttpResponse.json({ json, meta: [] });
          }

          await firstHeld;
          return HttpResponse.json(
            {
              code: FAILURE.code,
              defined: true,
              message: FAILURE.message,
              status: 500,
            },
            { status: 500 }
          );
        }
      )
    );
    await shown();

    await user.click(
      within(row("collares")).getByRole("button", {
        name: "Move down: Collares",
      })
    );
    await waitFor(() => {
      expect(received).toEqual([{ ids: [2, 1, 3] }]);
    });
    await user.click(
      within(row("pulseras")).getByRole("button", { name: "Move up: Pulseras" })
    );

    // Both moves are on screen while the first is still unanswered.
    expect(order()).toEqual(["Aros", "Pulseras", "Collares"]);
    expect(reportError).not.toHaveBeenCalled();
    failFirst();

    await waitFor(() => {
      expect(received).toEqual([{ ids: [2, 1, 3] }, { ids: [2, 3, 1] }]);
    });
    await waitFor(() => {
      expect(order()).toEqual(["Aros", "Pulseras", "Collares"]);
    });
    expect(reportError).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ code: "INTERNAL_SERVER_ERROR" }),
      { action: "Category.reorder" }
    );
  });

  test("dragging a row with the keyboard puts it in its new place", async () => {
    const { layOut, order, row, spies, user } = setup();
    await shown();
    layOut(["collares", "aros", "pulseras"]);

    within(row("collares"))
      .getByRole("button", { name: "Drag to reorder: Collares" })
      .focus();
    await user.keyboard(" ");
    await user.keyboard("{ArrowDown}");
    await user.keyboard(" ");

    await waitFor(() => {
      expect(spies.reorder).toHaveBeenCalledExactlyOnceWith({
        ids: [2, 1, 3],
      });
    });
    expect(order()).toEqual(["Aros", "Collares", "Pulseras"]);
    expect(announcer()).toHaveTextContent("“Collares” is now in place 2 of 3.");
  });

  test("dropping a row back where it was saves nothing", async () => {
    const { layOut, order, row, spies, user } = setup();
    await shown();
    layOut(["collares", "aros", "pulseras"]);

    within(row("aros"))
      .getByRole("button", { name: "Drag to reorder: Aros" })
      .focus();
    await user.keyboard(" ");
    await user.keyboard(" ");

    expect(order()).toEqual(["Collares", "Aros", "Pulseras"]);
    expect(announcer()).toHaveTextContent(/^$/u);
    expect(spies.reorder).not.toHaveBeenCalled();
  });

  test("dropping a row that left the list mid-drag saves nothing", async () => {
    const { layOut, order, queryClient, row, spies, user } = setup();
    await shown();
    layOut(["collares", "aros", "pulseras"]);

    within(row("collares"))
      .getByRole("button", { name: "Drag to reorder: Collares" })
      .focus();
    await user.keyboard(" ");
    await user.keyboard("{ArrowDown}");
    act(() => {
      queryClient.setQueryData(
        ["category", "list", { input: undefined }],
        [ROWS[1], ROWS[2]]
      );
    });
    await user.keyboard(" ");

    expect(order()).toEqual(["Aros", "Pulseras"]);
    expect(spies.reorder).not.toHaveBeenCalled();
  });

  test("deletes a category with articles once told where they move", async () => {
    const { row, spies, user } = setup();
    await shown();

    await user.click(
      within(row("aros")).getByRole("button", { name: "Delete: Aros" })
    );
    const dialog = await screen.findByTestId("delete-category-dialog");
    expect(dialog).toHaveAccessibleDescription(
      "“Aros” has 3 articles. Choose where they move before deleting it."
    );
    expect(
      within(dialog)
        .getAllByRole("option")
        .map((option) => option.textContent)
    ).toEqual(["Choose a category", "Collares", "Pulseras"]);
    await user.selectOptions(within(dialog).getByRole("combobox"), "3");
    await user.click(
      within(dialog).getByRole("button", { name: "Delete category" })
    );

    expect(await screen.findByText("Category deleted.")).toBeVisible();
    expect(spies.delete).toHaveBeenCalledExactlyOnceWith({
      id: 2,
      moveToId: 3,
    });
    await waitFor(() => {
      expect(screen.queryByTestId("delete-category-dialog")).toBeNull();
    });
  });

  test("deletes a category with no articles without asking where they move", async () => {
    const { row, spies, user } = setup();
    await shown();

    await user.click(
      within(row("pulseras")).getByRole("button", { name: "Delete: Pulseras" })
    );
    await user.click(
      within(await screen.findByTestId("delete-category-dialog")).getByRole(
        "button",
        { name: "Delete category" }
      )
    );

    await waitFor(() => {
      expect(spies.delete).toHaveBeenCalledExactlyOnceWith({
        id: 3,
        moveToId: null,
      });
    });
  });

  test("a deletion puts focus on the page title, its row being gone", async () => {
    const { row, user } = setup();
    await shown();

    await user.click(
      within(row("pulseras")).getByRole("button", { name: "Delete: Pulseras" })
    );
    await user.click(
      within(await screen.findByTestId("delete-category-dialog")).getByRole(
        "button",
        { name: "Delete category" }
      )
    );

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 1 })).toHaveFocus();
    });
  });

  test.each([
    [
      "Cancel",
      async (user: ReturnType<typeof setup>["user"]) => {
        await user.click(screen.getByRole("button", { name: "Cancel" }));
      },
    ],
    [
      "Escape",
      async (user: ReturnType<typeof setup>["user"]) => {
        await user.keyboard("{Escape}");
      },
    ],
  ])(
    "closing the delete dialog with %s gives focus back to the delete button",
    async (_how, close) => {
      const { row, spies, user } = setup();
      await shown();
      const trigger = within(row("pulseras")).getByRole("button", {
        name: "Delete: Pulseras",
      });

      await user.click(trigger);
      await screen.findByTestId("delete-category-dialog");
      await close(user);

      await waitFor(() => {
        expect(screen.queryByTestId("delete-category-dialog")).toBeNull();
      });
      expect(trigger).toHaveFocus();
      expect(spies.delete).not.toHaveBeenCalled();
    }
  );

  test("a deletion refused because the category gained articles asks where they move, unreported", async () => {
    const { row, spies, user } = setup();
    await shown();
    server.use(
      createOrpcErrorHandler("category.delete", {
        code: "BAD_REQUEST",
        message: "Choose where its articles move before deleting it",
        status: 400,
      }),
      createOrpcHandler("category.list", () => [
        ROWS[0],
        ROWS[1],
        makeRow(3, "Pulseras", { productCount: 2 }),
      ])
    );

    await user.click(
      within(row("pulseras")).getByRole("button", { name: "Delete: Pulseras" })
    );
    const dialog = await screen.findByTestId("delete-category-dialog");
    await user.click(
      within(dialog).getByRole("button", { name: "Delete category" })
    );

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      /^Choose which category its articles move to\.$/u
    );
    expect(
      await within(dialog).findByRole("combobox", {
        name: "Move its articles to",
      })
    ).toBeVisible();
    expect(reportError).not.toHaveBeenCalled();
    expect(spies.delete).not.toHaveBeenCalled();
  });

  test("reports a failed deletion and keeps the dialog open with the error", async () => {
    const { row, user } = setup({ writes: { delete: "fail" } });
    await shown();

    await user.click(
      within(row("pulseras")).getByRole("button", { name: "Delete: Pulseras" })
    );
    const dialog = await screen.findByTestId("delete-category-dialog");
    await user.click(
      within(dialog).getByRole("button", { name: "Delete category" })
    );

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      /^We could not save the change\. Try again\.$/u
    );
    expect(reportError).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ code: "INTERNAL_SERVER_ERROR" }),
      { action: "Category.delete" }
    );
  });

  test("a refusal asking where the articles go clears once a destination is chosen, and a failed retry says only that it failed", async () => {
    const { row, spies, user } = setup();
    await shown();
    server.use(
      createOrpcErrorHandler("category.delete", {
        code: "BAD_REQUEST",
        message: "Choose where its articles move before deleting it",
        status: 400,
      }),
      createOrpcHandler("category.list", () => [
        ROWS[0],
        ROWS[1],
        makeRow(3, "Pulseras", { productCount: 2 }),
      ])
    );

    await user.click(
      within(row("pulseras")).getByRole("button", { name: "Delete: Pulseras" })
    );
    const dialog = await screen.findByTestId("delete-category-dialog");
    await user.click(
      within(dialog).getByRole("button", { name: "Delete category" })
    );
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      /^Choose which category its articles move to\.$/u
    );

    await user.selectOptions(
      await within(dialog).findByRole("combobox", {
        name: "Move its articles to",
      }),
      "1"
    );

    expect(within(dialog).queryByRole("alert")).toBeNull();

    server.use(createOrpcErrorHandler("category.delete", FAILURE));
    await user.click(
      within(dialog).getByRole("button", { name: "Delete category" })
    );

    await waitFor(() => {
      expect(
        within(dialog)
          .queryAllByRole("alert")
          .map((alert) => alert.textContent)
      ).toEqual(["We could not save the change. Try again."]);
    });
    expect(reportError).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ code: "INTERNAL_SERVER_ERROR" }),
      { action: "Category.delete" }
    );
    expect(spies.delete).not.toHaveBeenCalled();
  });

  test("a retry starts without the previous try's error", async () => {
    const { row, spies, user } = setup({ writes: { delete: "fail" } });
    await shown();

    await user.click(
      within(row("pulseras")).getByRole("button", { name: "Delete: Pulseras" })
    );
    const dialog = await screen.findByTestId("delete-category-dialog");
    await user.click(
      within(dialog).getByRole("button", { name: "Delete category" })
    );
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      /^We could not save the change\. Try again\.$/u
    );

    server.use(
      createOrpcHandler("category.delete", async (input) => {
        spies.delete(input);
        return await new Promise<never>(() => {});
      })
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Delete category" })
    );

    expect(
      await within(dialog).findByRole("button", { name: "Deleting…" })
    ).toBeDisabled();
    expect(within(dialog).queryByRole("alert")).toBeNull();
    expect(spies.delete).toHaveBeenCalledExactlyOnceWith({
      id: 3,
      moveToId: null,
    });
  });

  test("tells a screen reader how to drag with the keyboard, in the page's language", async () => {
    const { row } = setup();
    await shown();

    const handle = within(row("collares")).getByRole("button", {
      name: "Drag to reorder: Collares",
    });
    expect(handle).toHaveAccessibleDescription(
      "To reorder with the keyboard, press space on the handle, move it with the arrow keys and press space again to drop it, or Escape to cancel."
    );
  });

  test("announces a keyboard drag by the category's name: picked up, over another, dropped in place", async () => {
    const { layOut, row, spies, user } = setup();
    await shown();
    layOut(["collares", "aros", "pulseras"]);
    within(row("collares"))
      .getByRole("button", { name: "Drag to reorder: Collares" })
      .focus();

    await user.keyboard(" ");
    await waitFor(() => {
      expect(dragAnnouncer()).toHaveTextContent(/^Picked up “Collares”\.$/u);
    });

    await user.keyboard("{ArrowDown}");
    await waitFor(() => {
      expect(dragAnnouncer()).toHaveTextContent(
        /^“Collares” is over “Aros”\.$/u
      );
    });

    await user.keyboard("{ArrowUp}");
    await user.keyboard(" ");
    await waitFor(() => {
      expect(dragAnnouncer()).toHaveTextContent(
        /^“Collares” stayed where it was\.$/u
      );
    });
    expect(spies.reorder).not.toHaveBeenCalled();
  });

  test("a drop that moved the row leaves dnd-kit's region on the move and announces the place", async () => {
    const { layOut, row, user } = setup();
    await shown();
    layOut(["collares", "aros", "pulseras"]);
    within(row("collares"))
      .getByRole("button", { name: "Drag to reorder: Collares" })
      .focus();

    await user.keyboard(" ");
    await user.keyboard("{ArrowDown}");
    await user.keyboard(" ");

    await waitFor(() => {
      expect(announcer()).toHaveTextContent(
        /^“Collares” is now in place 2 of 3\.$/u
      );
    });
    expect(dragAnnouncer()).toHaveTextContent(/^“Collares” is over “Aros”\.$/u);
  });

  test("announces a cancelled keyboard drag by the category's name", async () => {
    const { layOut, order, row, spies, user } = setup();
    await shown();
    layOut(["collares", "aros", "pulseras"]);
    within(row("collares"))
      .getByRole("button", { name: "Drag to reorder: Collares" })
      .focus();

    await user.keyboard(" ");
    await user.keyboard("{ArrowDown}");
    await user.keyboard("{Escape}");

    await waitFor(() => {
      expect(dragAnnouncer()).toHaveTextContent(
        /^Move cancelled: “Collares” stayed where it was\.$/u
      );
    });
    expect(order()).toEqual(["Collares", "Aros", "Pulseras"]);
    expect(spies.reorder).not.toHaveBeenCalled();
  });

  test("in Spanish, tells and announces a keyboard drag in Spanish", async () => {
    const { layOut, row, user } = setup({ locale: "es" });
    await shown();
    layOut(["collares", "aros", "pulseras"]);
    const handle = within(row("collares")).getByRole("button", {
      name: "Arrastrar para ordenar: Collares",
    });
    expect(handle).toHaveAccessibleDescription(
      "Para ordenar con el teclado, apretá espacio en la manija, movela con las flechas y apretá espacio de nuevo para dejarla, o Escape para cancelar."
    );
    handle.focus();

    await user.keyboard(" ");
    await waitFor(() => {
      expect(dragAnnouncer()).toHaveTextContent(/^Tomaste «Collares»\.$/u);
    });
    await user.keyboard("{ArrowDown}");
    await waitFor(() => {
      expect(dragAnnouncer()).toHaveTextContent(
        /^«Collares» está sobre «Aros»\.$/u
      );
    });
    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(dragAnnouncer()).toHaveTextContent(
        /^Movimiento cancelado: «Collares» quedó donde estaba\.$/u
      );
    });
  });

  test("in Spanish, counts and names everything in Spanish", async () => {
    const { row } = setup({ locale: "es" });
    await shown();

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      /^Categorías$/u
    );
    expect(row("collares")).toHaveTextContent("CollaresNecklaces · 1 artículo");
    expect(row("aros")).toHaveTextContent(/^Aros3 artículos$/u);
    expect(
      within(screen.getByRole("list", { name: "Categorías de la tienda" }))
        .getAllByRole("button", { name: /^Arrastrar para ordenar: / })
        .map((button) => button.getAttribute("aria-label"))
    ).toEqual([
      "Arrastrar para ordenar: Collares",
      "Arrastrar para ordenar: Aros",
      "Arrastrar para ordenar: Pulseras",
    ]);
    expect(screen.getByRole("button", { name: "Agregar" })).toBeVisible();
  });
});
