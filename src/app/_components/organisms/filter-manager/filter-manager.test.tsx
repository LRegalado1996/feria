import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { RequestHandler } from "msw";
import type { ReactNode } from "react";
import { describe, expect, type Mock, test, vi } from "vitest";

import { Toaster } from "@/app/_components/molecules/sonner";
import { reportError } from "@/lib/errors/client";
import type { Locale } from "@/lib/i18n/config";
import { renderWithI18n } from "@/test/i18n";
import { createOrpcErrorHandler, createOrpcHandler, server } from "@/test/msw";

import { FilterManager } from "./filter-manager";

vi.mock("@/lib/orpc/client", async () => {
  const { orpcClientMock } = await import("@/test/mocks/orpc-client");
  return orpcClientMock;
});

vi.mock("@/lib/errors/client", () => ({ reportError: vi.fn() }));

const GENERIC = "We could not save the change. Try again.";

function makeValue(
  id: number,
  nameEs: string,
  overrides: Partial<{
    nameEn: string | null;
    productCount: number;
    swatchColor: string | null;
  }> = {}
) {
  return {
    id,
    nameEn: null,
    nameEs,
    position: 0,
    productCount: 0,
    slug: nameEs.toLowerCase(),
    swatchColor: null,
    ...overrides,
  };
}

type Value = ReturnType<typeof makeValue>;

function makeFilter(
  id: number,
  nameEs: string,
  values: Value[],
  nameEn: string | null = null
) {
  return {
    id,
    nameEn,
    nameEs,
    position: id - 7,
    slug: nameEs.toLowerCase(),
    values: values.map((value, position) => ({ ...value, position })),
  };
}

type Filter = ReturnType<typeof makeFilter>;

const ROWS: Filter[] = [
  makeFilter(
    7,
    "Color",
    [
      makeValue(21, "Dorado", {
        nameEn: "Gold",
        productCount: 1,
        swatchColor: "#d4af37",
      }),
      makeValue(22, "Plateado", { productCount: 3 }),
      makeValue(23, "Negro", { swatchColor: "#000000" }),
    ],
    "Colour"
  ),
  makeFilter(8, "Material", []),
  makeFilter(9, "Talle", [makeValue(31, "Único", { productCount: 2 })]),
];

const FAILURE = {
  code: "INTERNAL_SERVER_ERROR",
  message: "Internal server error",
  status: 500,
};

const CONFLICT = {
  code: "CONFLICT",
  message: "Another one already has that name",
  status: 409,
};

type Outcome = "conflict" | "fail" | "hang" | "ok";

const WRITES = [
  "create",
  "createValue",
  "delete",
  "deleteValue",
  "rename",
  "reorder",
  "reorderValues",
  "updateValue",
] as const;

type Write = (typeof WRITES)[number];

/** A procedure that records its input, then answers, fails or never answers. */
function answer(
  path: string,
  spy: (input: unknown) => unknown,
  outcome: Outcome
): RequestHandler {
  if (outcome === "fail" || outcome === "conflict") {
    return createOrpcErrorHandler(
      path,
      outcome === "fail" ? FAILURE : CONFLICT
    );
  }

  return createOrpcHandler(path, async (input) => {
    const output = spy(input);
    return outcome === "hang" ? await new Promise<never>(() => {}) : output;
  });
}

interface SetupOptions {
  /** `attribute.list`'s answer: rows, a failure, or nothing yet. */
  list?: Filter[] | "fail" | "hang";
  locale?: Locale;
  /** How many articles the server says a deleted value was taken off. */
  removedFromArticles?: number;
  /** How each write ends. */
  writes?: Partial<Record<Write, Outcome>>;
}

function setup({
  list = ROWS,
  locale = "en",
  removedFromArticles = 0,
  writes = {},
}: SetupOptions = {}) {
  const spies: Record<Write | "list", Mock<(input: unknown) => unknown>> = {
    create: vi.fn((_input: unknown) => ({ id: 10, position: 3, slug: "x" })),
    createValue: vi.fn((_input: unknown) => ({ id: 40, position: 3 })),
    delete: vi.fn((_input: unknown) => ({ id: 7 })),
    deleteValue: vi.fn((_input: unknown) => ({ id: 22, removedFromArticles })),
    list: vi.fn((_input: unknown) => (Array.isArray(list) ? list : ROWS)),
    rename: vi.fn((_input: unknown) => ({ id: 7, slug: "color" })),
    reorder: vi.fn((input: unknown) => input),
    reorderValues: vi.fn((input: unknown) => input),
    updateValue: vi.fn((_input: unknown) => ({ id: 21, slug: "dorado" })),
  };
  server.use(
    Array.isArray(list)
      ? createOrpcHandler("attribute.list", spies.list)
      : answer("attribute.list", spies.list, list === "fail" ? "fail" : "hang"),
    ...WRITES.map((name) =>
      answer(`attribute.${name}`, spies[name], writes[name] ?? "ok")
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
  renderWithI18n(<FilterManager />, {
    locale,
    wrapper: Providers,
  });

  const card = (slug: string) => screen.getByTestId(`filter-card-${slug}`);
  const value = (slug: string) => screen.getByTestId(`filter-value-${slug}`);
  /** The form whose submit button has this name, inside `scope`. */
  const formWith = (submit: string, scope: HTMLElement = document.body) => {
    const form = within(scope)
      .getByRole("button", { name: submit })
      .closest("form");

    if (!form) {
      throw new Error(`No form submits with "${submit}"`);
    }

    return within(form);
  };
  const press = async (scope: HTMLElement, name: string) => {
    await user.click(within(scope).getByRole("button", { name }));
  };

  /** The filters' Spanish names, top to bottom. */
  const filterOrder = () =>
    screen.getAllByTestId("filter-name").map((name) => name.textContent);
  /** A filter's values' Spanish names, top to bottom. */
  const valueOrder = (slug: string) =>
    within(card(slug))
      .getAllByTestId("filter-value-name")
      .map((name) => name.textContent);
  const button = (scope: HTMLElement, name: string) =>
    within(scope).getByRole("button", { name });

  return {
    button,
    card,
    filterOrder,
    formWith,
    press,
    queryClient,
    spies,
    user,
    value,
    valueOrder,
  };
}

/** The manager's own live region. */
function announcer() {
  return screen.getByRole("status");
}

/** The toast with this text, not the live region's copy of it. */
function toastWith(text: string) {
  return screen
    .getAllByText(text)
    .find((node) => node.closest("output") === null);
}

async function shown() {
  await screen.findByTestId("filter-list");
}

describe("FilterManager", () => {
  test("shows a busy skeleton while the list loads", async () => {
    const { spies } = setup({ list: "hang" });

    const skeleton = screen.getByTestId("filter-list-skeleton");
    expect(skeleton).toHaveAttribute("aria-busy", "true");
    expect(skeleton).toHaveTextContent(/^Loading$/u);
    expect(screen.queryByTestId("filter-list")).toBeNull();
    await waitFor(() => {
      expect(spies.list).toHaveBeenCalledExactlyOnceWith(undefined);
    });
  });

  test("says the list failed to load and loads it again on retry", async () => {
    const { spies, user } = setup({ list: "fail" });

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      /^We could not load the filters\.Try again$/u
    );
    expect(screen.queryByTestId("empty-state")).toBeNull();

    server.use(createOrpcHandler("attribute.list", spies.list));
    await user.click(within(alert).getByRole("button", { name: "Try again" }));

    await shown();
    expect(spies.list).toHaveBeenCalledExactlyOnceWith(undefined);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByTestId("filter-list-skeleton")).toBeNull();
  });

  test("invites adding the first filter when the store has none", async () => {
    setup({ list: [] });

    expect(await screen.findByTestId("empty-state")).toHaveTextContent(
      "No filters yet. Add the first one above, Color for example."
    );
    expect(screen.queryByTestId("filter-list")).toBeNull();
  });

  test("lists each filter in order with its English name and URL parameter", async () => {
    const { card } = setup();
    await shown();

    expect(
      within(screen.getByRole("list", { name: "The store's filters" }))
        .getAllByTestId("filter-name")
        .map((heading) => heading.textContent)
    ).toEqual(["Color", "Material", "Talle"]);
    expect(within(card("color")).getByText("Colour ·")).toHaveAttribute(
      "lang",
      "en"
    );
    expect(within(card("color")).getByText("?color=")).toBeVisible();
    expect(within(card("material")).getByText("?material=")).toBeVisible();
    expect(within(card("material")).queryByText(/ · /u)).toBeNull();
    expect(card("material")).toHaveTextContent(
      "This filter has no values yet."
    );
    expect(within(card("material")).queryByRole("list")).toBeNull();
  });

  test("lists a filter's values in order, each with its swatch dot and article count", async () => {
    const { card, value } = setup();
    await shown();

    expect(
      within(
        within(card("color")).getByRole("list", { name: "Values of “Color”" })
      )
        .getAllByTestId("filter-value-name")
        .map((name) => name.textContent)
    ).toEqual(["Dorado", "Plateado", "Negro"]);
    expect(value("dorado")).toHaveTextContent(/^Dorado · Gold1 article$/u);
    expect(within(value("dorado")).getByText("· Gold")).toHaveAttribute(
      "lang",
      "en"
    );
    expect(value("plateado")).toHaveTextContent(/^Plateado3 articles$/u);
    expect(value("negro")).toHaveTextContent(/^Negro0 articles$/u);
    expect(
      ["dorado", "plateado", "negro"].map(
        (slug) =>
          within(value(slug)).getByTestId("filter-value-count").textContent
      )
    ).toEqual(["1 article", "3 articles", "0 articles"]);
    expect(
      within(value("dorado")).getByTestId("filter-value-swatch")
    ).toHaveStyle({ backgroundColor: "#d4af37" });
    expect(
      within(value("plateado")).getByTestId("filter-value-swatch")
    ).toHaveStyle({ visibility: "hidden" });
    expect(card("color")).not.toHaveTextContent(
      "This filter has no values yet."
    );
  });

  test("names every control after its filter or value", async () => {
    const { card, value } = setup();
    await shown();

    expect(
      within(card("material"))
        .getAllByRole("button")
        .map(
          (button) => button.getAttribute("aria-label") ?? button.textContent
        )
    ).toEqual([
      "Move up: Material",
      "Move down: Material",
      "Rename filter: Material",
      "Delete filter: Material",
      "Add value",
    ]);
    expect(
      within(card("material")).getByLabelText("Add a swatch color")
    ).toHaveAttribute("type", "color");
    expect(
      within(value("plateado"))
        .getAllByRole("button")
        .map((button) => button.getAttribute("aria-label"))
    ).toEqual([
      "Move up: Plateado",
      "Move down: Plateado",
      "Edit value: Plateado",
      "Delete value: Plateado",
    ]);
    expect(
      within(card("material")).getByRole("heading", { level: 3 })
    ).toHaveTextContent(/^New value of “Material”$/u);
  });

  test("adds a filter, says so and reads the list again", async () => {
    const { formWith, spies, user } = setup();
    await shown();
    const form = formWith("Add filter");

    await user.type(form.getByLabelText(/^Name in Spanish/u), "Largo");
    await user.click(form.getByRole("button", { name: "Add filter" }));

    expect(await screen.findByText("Filter added.")).toBeVisible();
    expect(spies.create).toHaveBeenCalledExactlyOnceWith({
      nameEn: null,
      nameEs: "Largo",
    });
    await waitFor(() => {
      expect(spies.list.mock.calls).toEqual([[undefined], [undefined]]);
    });
    expect(form.getByLabelText(/^Name in Spanish/u)).toHaveValue("");
  });

  test("puts a filter name already in use on the Spanish field, without reporting it", async () => {
    const { formWith, user } = setup({ writes: { create: "conflict" } });
    await shown();
    const form = formWith("Add filter");
    const spanish = form.getByLabelText(/^Name in Spanish/u);

    await user.type(spanish, "Color");
    await user.click(form.getByRole("button", { name: "Add filter" }));

    await waitFor(() => {
      expect(spanish).toHaveAttribute("aria-invalid", "true");
    });
    expect(spanish).toHaveAccessibleDescription(
      "There is already one with that name here."
    );
    expect(spanish).toHaveValue("Color");
    expect(reportError).not.toHaveBeenCalled();
  });

  test("reports a failed addition and says it failed", async () => {
    const { formWith, user } = setup({ writes: { create: "fail" } });
    await shown();
    const form = formWith("Add filter");

    await user.type(form.getByLabelText(/^Name in Spanish/u), "Largo");
    await user.click(form.getByRole("button", { name: "Add filter" }));

    expect(await form.findByRole("alert")).toHaveTextContent(
      /^We could not save the change\. Try again\.$/u
    );
    expect(reportError).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ code: "INTERNAL_SERVER_ERROR" }),
      { action: "Attribute.create" }
    );
    expect(screen.queryByText("Filter added.")).toBeNull();
  });

  test("renames a filter in place, shows the name read again, and gives focus back to its rename button", async () => {
    const { button, card, formWith, press, spies, user } = setup();
    await shown();
    spies.list.mockImplementation(() => [
      { ...ROWS[0], nameEs: "Colores" },
      ...ROWS.slice(1),
    ]);

    await press(card("color"), "Rename filter: Color");
    const form = formWith("Save", card("color"));
    expect(form.getByLabelText(/^Name in Spanish/u)).toHaveValue("Color");
    // The button that opened it is gone: focus moves into the editor.
    await waitFor(() => {
      expect(form.getByLabelText(/^Name in Spanish/u)).toHaveFocus();
    });
    expect(form.getByLabelText("Name in English (optional)")).toHaveValue(
      "Colour"
    );
    expect(form.queryByLabelText("Add a swatch color")).toBeNull();
    await user.clear(form.getByLabelText(/^Name in Spanish/u));
    await user.type(form.getByLabelText(/^Name in Spanish/u), "Colores");
    await user.click(form.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Filter renamed.")).toBeVisible();
    expect(spies.rename).toHaveBeenCalledExactlyOnceWith({
      id: 7,
      nameEn: "Colour",
      nameEs: "Colores",
    });
    await waitFor(() => {
      expect(
        within(card("color")).queryByRole("button", { name: "Save" })
      ).toBeNull();
    });
    await waitFor(() => {
      expect(
        within(card("color")).getByTestId("filter-name")
      ).toHaveTextContent(/^Colores$/u);
    });
    expect(button(card("color"), "Rename filter: Colores")).toHaveFocus();
  });

  test("cancelling a rename puts the filter back as it was, focus on its rename button", async () => {
    const { button, card, press, spies } = setup();
    await shown();

    await press(card("talle"), "Rename filter: Talle");
    await press(card("talle"), "Cancel");

    expect(within(card("talle")).getByTestId("filter-name")).toHaveTextContent(
      /^Talle$/u
    );
    expect(button(card("talle"), "Rename filter: Talle")).toHaveFocus();
    expect(spies.rename).not.toHaveBeenCalled();
  });

  test("reports a failed rename and keeps its form open", async () => {
    const { card, formWith, press } = setup({ writes: { rename: "fail" } });
    await shown();

    await press(card("talle"), "Rename filter: Talle");
    const form = formWith("Save", card("talle"));
    await press(card("talle"), "Save");

    expect(await form.findByRole("alert")).toHaveTextContent(
      /^We could not save the change\. Try again\.$/u
    );
    expect(form.getByLabelText(/^Name in Spanish/u)).toHaveValue("Talle");
    expect(reportError).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ code: "INTERNAL_SERVER_ERROR" }),
      { action: "Attribute.rename" }
    );
  });

  test("adds a value with its swatch to its own filter", async () => {
    const { card, spies, user } = setup();
    await shown();
    const form = within(
      within(card("color")).getByRole("form", {
        name: "New value of “Color”",
      })
    );

    await user.type(form.getByLabelText(/^Name in Spanish/u), "Rosa");
    await user.type(form.getByLabelText("Name in English (optional)"), "Pink");
    fireEvent.input(form.getByLabelText("Add a swatch color"), {
      target: { value: "#ff00aa" },
    });
    expect(form.getByLabelText("Swatch color")).toHaveValue("#ff00aa");
    await user.click(form.getByRole("button", { name: "Add value" }));

    expect(await screen.findByText("Value added.")).toBeVisible();
    expect(spies.createValue).toHaveBeenCalledExactlyOnceWith({
      attributeId: 7,
      nameEn: "Pink",
      nameEs: "Rosa",
      swatchColor: "#ff00aa",
    });
    await waitFor(() => {
      expect(form.getByLabelText(/^Name in Spanish/u)).toHaveValue("");
    });
  });

  test("adds a value without a swatch as none", async () => {
    const { card, formWith, spies, user } = setup();
    await shown();
    const form = formWith("Add value", card("material"));

    await user.type(form.getByLabelText(/^Name in Spanish/u), "Plata");
    await user.click(form.getByRole("button", { name: "Add value" }));

    await waitFor(() => {
      expect(spies.createValue).toHaveBeenCalledExactlyOnceWith({
        attributeId: 8,
        nameEn: null,
        nameEs: "Plata",
        swatchColor: null,
      });
    });
  });

  test("puts a value name already in use on the Spanish field, without reporting it", async () => {
    const { card, formWith, user } = setup({
      writes: { createValue: "conflict" },
    });
    await shown();
    const form = formWith("Add value", card("color"));
    const spanish = form.getByLabelText(/^Name in Spanish/u);

    await user.type(spanish, "Dorado");
    await user.click(form.getByRole("button", { name: "Add value" }));

    await waitFor(() => {
      expect(spanish).toHaveAccessibleDescription(
        "There is already one with that name here."
      );
    });
    expect(reportError).not.toHaveBeenCalled();
  });

  test("reports a failed value addition and says it failed", async () => {
    const { card, formWith, user } = setup({ writes: { createValue: "fail" } });
    await shown();
    const form = formWith("Add value", card("color"));

    await user.type(form.getByLabelText(/^Name in Spanish/u), "Rosa");
    await user.click(form.getByRole("button", { name: "Add value" }));

    expect(await form.findByRole("alert")).toHaveTextContent(
      /^We could not save the change\. Try again\.$/u
    );
    expect(reportError).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ code: "INTERNAL_SERVER_ERROR" }),
      { action: "Attribute.create_value" }
    );
  });

  test("edits a value in place, swatch included, then gives focus back to its edit button", async () => {
    const { button, formWith, press, spies, user, value } = setup();
    await shown();

    await press(value("dorado"), "Edit value: Dorado");
    const form = formWith("Save", value("dorado"));
    expect(form.getByLabelText(/^Name in Spanish/u)).toHaveValue("Dorado");
    await waitFor(() => {
      expect(form.getByLabelText(/^Name in Spanish/u)).toHaveFocus();
    });
    expect(form.getByLabelText("Name in English (optional)")).toHaveValue(
      "Gold"
    );
    expect(form.getByLabelText("Swatch color")).toHaveValue("#d4af37");
    await user.click(form.getByRole("button", { name: "Remove color" }));
    await user.click(form.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Value saved.")).toBeVisible();
    expect(spies.updateValue).toHaveBeenCalledExactlyOnceWith({
      id: 21,
      nameEn: "Gold",
      nameEs: "Dorado",
      swatchColor: null,
    });
    await waitFor(() => {
      expect(
        within(value("dorado")).queryByRole("button", { name: "Save" })
      ).toBeNull();
    });
    expect(value("dorado")).toHaveTextContent(/^Dorado · Gold1 article$/u);
    expect(button(value("dorado"), "Edit value: Dorado")).toHaveFocus();
  });

  test("cancelling a value's edit puts it back as it was, focus on its edit button", async () => {
    const { button, press, spies, value } = setup();
    await shown();

    await press(value("negro"), "Edit value: Negro");
    await press(value("negro"), "Cancel");

    expect(value("negro")).toHaveTextContent(/^Negro0 articles$/u);
    expect(button(value("negro"), "Edit value: Negro")).toHaveFocus();
    expect(spies.updateValue).not.toHaveBeenCalled();
  });

  test("reports a failed value edit and keeps its form open", async () => {
    const { formWith, press, value } = setup({
      writes: { updateValue: "fail" },
    });
    await shown();

    await press(value("negro"), "Edit value: Negro");
    const form = formWith("Save", value("negro"));
    await press(value("negro"), "Save");

    expect(await form.findByRole("alert")).toHaveTextContent(
      /^We could not save the change\. Try again\.$/u
    );
    expect(form.getByLabelText("Swatch color")).toHaveValue("#000000");
    expect(reportError).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ code: "INTERNAL_SERVER_ERROR" }),
      { action: "Attribute.update_value" }
    );
  });

  test("the first filter and value cannot move up, the last cannot move down", async () => {
    const { card, value } = setup();
    await shown();

    const button = (scope: HTMLElement, name: string) =>
      within(scope).getByRole("button", { name });
    expect(button(card("color"), "Move up: Color")).toBeDisabled();
    expect(button(card("color"), "Move down: Color")).toBeEnabled();
    expect(button(card("talle"), "Move up: Talle")).toBeEnabled();
    expect(button(card("talle"), "Move down: Talle")).toBeDisabled();
    expect(button(value("dorado"), "Move up: Dorado")).toBeDisabled();
    expect(button(value("dorado"), "Move down: Dorado")).toBeEnabled();
    expect(button(value("negro"), "Move up: Negro")).toBeEnabled();
    expect(button(value("negro"), "Move down: Negro")).toBeDisabled();
    // A filter's only value is both its first and its last.
    expect(button(value("único"), "Move up: Único")).toBeDisabled();
    expect(button(value("único"), "Move down: Único")).toBeDisabled();
  });

  test.each([
    ["down", "Color", [8, 7, 9], "“Color” is now in place 2 of 3."],
    ["up", "Talle", [7, 9, 8], "“Talle” is now in place 2 of 3."],
    ["up", "Material", [8, 7, 9], "“Material” is now in place 1 of 3."],
  ] as const)(
    "moving a filter %s saves the new order and announces it",
    async (direction, name, ids, announcement) => {
      const { card, filterOrder, press, spies } = setup({
        writes: { reorder: "hang" },
      });
      await shown();

      await press(card(name.toLowerCase()), `Move ${direction}: ${name}`);

      // On screen at once, before the server answers.
      await waitFor(() => {
        expect(filterOrder()).toEqual(
          ids.map((id) => ROWS.find((row) => row.id === id)?.nameEs)
        );
      });
      expect(announcer()).toHaveTextContent(announcement);
      expect(announcer()).toHaveAttribute("aria-live", "polite");
      await waitFor(() => {
        expect(spies.reorder).toHaveBeenCalledExactlyOnceWith({
          ids,
        });
      });
      expect(spies.reorderValues).not.toHaveBeenCalled();
    }
  );

  test.each([
    ["down", "Dorado", [22, 21, 23], "“Dorado” is now in place 2 of 3."],
    ["up", "Negro", [21, 23, 22], "“Negro” is now in place 2 of 3."],
    ["up", "Plateado", [22, 21, 23], "“Plateado” is now in place 1 of 3."],
  ] as const)(
    "moving a value %s saves its filter's new order and announces it",
    async (direction, name, ids, announcement) => {
      const { press, spies, value, valueOrder } = setup({
        writes: { reorderValues: "hang" },
      });
      await shown();

      await press(value(name.toLowerCase()), `Move ${direction}: ${name}`);

      await waitFor(() => {
        expect(valueOrder("color")).toEqual(
          ids.map(
            (id) => ROWS[0]?.values.find((other) => other.id === id)?.nameEs
          )
        );
      });
      expect(announcer()).toHaveTextContent(announcement);
      await waitFor(() => {
        expect(spies.reorderValues).toHaveBeenCalledExactlyOnceWith({
          attributeId: 7,
          ids,
        });
      });
      expect(spies.reorder).not.toHaveBeenCalled();
    }
  );

  test("a second quick move of a filter starts from the first move's order", async () => {
    const { card, filterOrder, press, spies } = setup();
    await shown();

    await press(card("color"), "Move down: Color");
    await waitFor(() => {
      expect(filterOrder()).toEqual(["Material", "Color", "Talle"]);
    });
    await press(card("color"), "Move down: Color");

    await waitFor(() => {
      expect(spies.reorder.mock.calls).toEqual([
        [{ ids: [8, 7, 9] }],
        [{ ids: [8, 9, 7] }],
      ]);
    });
    expect(filterOrder()).toEqual(["Material", "Talle", "Color"]);
    expect(announcer()).toHaveTextContent("“Color” is now in place 3 of 3.");
    // Saved moves read nothing again.
    expect(spies.list).toHaveBeenCalledExactlyOnceWith(undefined);
  });

  test("a second quick move of a value starts from the first move's order", async () => {
    const { press, spies, value, valueOrder } = setup();
    await shown();

    await press(value("dorado"), "Move down: Dorado");
    await waitFor(() => {
      expect(valueOrder("color")).toEqual(["Plateado", "Dorado", "Negro"]);
    });
    await press(value("dorado"), "Move down: Dorado");

    await waitFor(() => {
      expect(spies.reorderValues.mock.calls).toEqual([
        [{ attributeId: 7, ids: [22, 21, 23] }],
        [{ attributeId: 7, ids: [22, 23, 21] }],
      ]);
    });
    expect(valueOrder("color")).toEqual(["Plateado", "Negro", "Dorado"]);
    expect(valueOrder("talle")).toEqual(["Único"]);
  });

  test.each([
    ["filter", "reorder", "Color", "color"],
    ["value", "reorderValues", "Dorado", "dorado"],
  ] as const)(
    "reports a failed %s move, says so in a toast and the live region",
    async (kind, write, name, slug) => {
      const { card, filterOrder, press, value, valueOrder } = setup({
        writes: { [write]: "fail" },
      });
      await shown();

      await press(
        kind === "filter" ? card(slug) : value(slug),
        `Move down: ${name}`
      );

      // The move it announced did not happen: the live region says so, and a
      // toast says it too.
      await waitFor(() => {
        expect(announcer()).toHaveTextContent(
          /^We could not save the change\. Try again\.$/u
        );
      });
      await waitFor(() => {
        expect(toastWith(GENERIC)).toBeVisible();
      });
      expect(reportError).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ code: "INTERNAL_SERVER_ERROR" }),
        { action: "Attribute.reorder" }
      );
      await waitFor(() => {
        expect(filterOrder()).toEqual(["Color", "Material", "Talle"]);
      });
      expect(valueOrder("color")).toEqual(["Dorado", "Plateado", "Negro"]);
    }
  );

  test("deletes a filter once confirmed, then puts focus on the page title", async () => {
    const { card, press, spies } = setup();
    await shown();

    await press(card("color"), "Delete filter: Color");
    const dialog = await screen.findByTestId("confirm-dialog");
    expect(dialog).toHaveAccessibleName("Delete the filter?");
    expect(dialog).toHaveAccessibleDescription(
      "“Color” will be deleted with all its values, and they will be taken off the articles that carry them. This cannot be undone."
    );
    expect(spies.delete).not.toHaveBeenCalled();
    // The list read after the deletion no longer has it.
    spies.list.mockImplementation(() => ROWS.slice(1));
    await press(dialog, "Delete filter");

    expect(await screen.findByText("Filter deleted.")).toBeVisible();
    expect(spies.delete).toHaveBeenCalledExactlyOnceWith({
      id: 7,
    });
    await waitFor(() => {
      expect(screen.queryByTestId("confirm-dialog")).toBeNull();
    });
    await waitFor(() => {
      expect(screen.queryByTestId("filter-card-color")).toBeNull();
    });
    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 1 })).toHaveFocus();
    });
  });

  test("keeps the filter's dialog open, saying so, while the deletion runs", async () => {
    const { card, press, spies } = setup({ writes: { delete: "hang" } });
    await shown();

    await press(card("material"), "Delete filter: Material");
    const dialog = await screen.findByTestId("confirm-dialog");
    await press(dialog, "Delete filter");

    expect(
      await within(dialog).findByRole("button", { name: "Deleting…" })
    ).toBeDisabled();
    expect(spies.delete).toHaveBeenCalledExactlyOnceWith({
      id: 8,
    });
    expect(screen.queryByText("Filter deleted.")).toBeNull();
  });

  test.each([
    ["Cancel", "the cancel button"],
    ["{Escape}", "Escape"],
  ])(
    "closing the filter's dialog with %s deletes nothing and gives focus back to its delete button (%s)",
    async (key, _how) => {
      const { button, card, press, spies, user } = setup();
      await shown();

      await press(card("talle"), "Delete filter: Talle");
      const dialog = await screen.findByTestId("confirm-dialog");
      await (key === "Cancel" ? press(dialog, "Cancel") : user.keyboard(key));

      await waitFor(() => {
        expect(screen.queryByTestId("confirm-dialog")).toBeNull();
      });
      await waitFor(() => {
        expect(button(card("talle"), "Delete filter: Talle")).toHaveFocus();
      });
      expect(spies.delete).not.toHaveBeenCalled();
    }
  );

  test("reports a failed filter deletion, says so and keeps the dialog open", async () => {
    const { card, press } = setup({ writes: { delete: "fail" } });
    await shown();

    await press(card("talle"), "Delete filter: Talle");
    const dialog = await screen.findByTestId("confirm-dialog");
    await press(dialog, "Delete filter");

    expect(await screen.findByText(GENERIC)).toBeVisible();
    expect(reportError).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ code: "INTERNAL_SERVER_ERROR" }),
      { action: "Attribute.delete" }
    );
    expect(screen.getByTestId("confirm-dialog")).toBe(dialog);
    expect(screen.queryByText("Filter deleted.")).toBeNull();
  });

  test.each([
    [
      "plateado",
      "Plateado",
      "“Plateado” is on 3 articles. It will be taken off those articles. This cannot be undone.",
    ],
    [
      "dorado",
      "Dorado",
      "“Dorado” is on 1 article. It will be taken off those articles. This cannot be undone.",
    ],
    ["negro", "Negro", "“Negro” will be deleted. This cannot be undone."],
  ] as const)(
    "asks before deleting %s, saying what it is taken off",
    async (slug, name, description) => {
      const { press, value } = setup();
      await shown();

      await press(value(slug), `Delete value: ${name}`);

      const dialog = await screen.findByTestId("confirm-dialog");
      expect(dialog).toHaveAccessibleName("Delete the value?");
      expect(dialog).toHaveAccessibleDescription(description);
    }
  );

  test.each([
    [4, "Value deleted: taken off 4 articles."],
    [1, "Value deleted: taken off 1 article."],
    [0, "Value deleted."],
  ])(
    "after deleting a value taken off %i articles, says %j",
    async (removedFromArticles, message) => {
      const { press, value } = setup({ removedFromArticles });
      await shown();

      await press(value("plateado"), "Delete value: Plateado");
      await press(await screen.findByTestId("confirm-dialog"), "Delete value");

      expect(await screen.findByText(message)).toBeVisible();
    }
  );

  test("deleting a value while its filter is being renamed puts focus on the page title", async () => {
    const { card, press, spies, value } = setup();
    await shown();

    await press(card("color"), "Rename filter: Color");
    await press(value("negro"), "Delete value: Negro");
    await press(await screen.findByTestId("confirm-dialog"), "Delete value");

    await waitFor(() => {
      expect(screen.queryByTestId("confirm-dialog")).toBeNull();
    });
    expect(spies.deleteValue).toHaveBeenCalledExactlyOnceWith({
      id: 23,
    });
    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 1 })).toHaveFocus();
    });
  });

  test("deletes a value once confirmed, then puts focus on its filter's name", async () => {
    const { card, press, spies, value } = setup();
    await shown();

    await press(value("plateado"), "Delete value: Plateado");
    const dialog = await screen.findByTestId("confirm-dialog");
    // The list read after the deletion no longer has it.
    spies.list.mockImplementation(() => [
      {
        ...ROWS[0],
        values: ROWS[0]?.values.filter((row) => row.id !== 22) ?? [],
      },
      ...ROWS.slice(1),
    ]);
    await press(dialog, "Delete value");

    expect(await screen.findByText("Value deleted.")).toBeVisible();
    expect(spies.deleteValue).toHaveBeenCalledExactlyOnceWith({
      id: 22,
    });
    await waitFor(() => {
      expect(screen.queryByTestId("confirm-dialog")).toBeNull();
    });
    await waitFor(() => {
      expect(screen.queryByTestId("filter-value-plateado")).toBeNull();
    });
    await waitFor(() => {
      expect(within(card("color")).getByTestId("filter-name")).toHaveFocus();
    });
  });

  test.each([
    ["Cancel", "the cancel button"],
    ["{Escape}", "Escape"],
  ])(
    "closing a value's dialog with %s deletes nothing and gives focus back to its delete button (%s)",
    async (key, _how) => {
      const { button, press, spies, user, value } = setup();
      await shown();

      await press(value("negro"), "Delete value: Negro");
      const dialog = await screen.findByTestId("confirm-dialog");
      await (key === "Cancel" ? press(dialog, "Cancel") : user.keyboard(key));

      await waitFor(() => {
        expect(screen.queryByTestId("confirm-dialog")).toBeNull();
      });
      await waitFor(() => {
        expect(button(value("negro"), "Delete value: Negro")).toHaveFocus();
      });
      expect(spies.deleteValue).not.toHaveBeenCalled();
    }
  );

  test("reports a failed value deletion, says so and keeps the dialog open", async () => {
    const { press, value } = setup({ writes: { deleteValue: "fail" } });
    await shown();

    await press(value("negro"), "Delete value: Negro");
    const dialog = await screen.findByTestId("confirm-dialog");
    await press(dialog, "Delete value");

    expect(await screen.findByText(GENERIC)).toBeVisible();
    expect(reportError).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ code: "INTERNAL_SERVER_ERROR" }),
      { action: "Attribute.delete_value" }
    );
    expect(screen.getByTestId("confirm-dialog")).toBe(dialog);
    expect(screen.queryByText("Value deleted.")).toBeNull();
  });

  test("in Spanish, counts and names everything in Spanish", async () => {
    const { card, press, value } = setup({ locale: "es" });
    await shown();

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      /^Filtros$/u
    );
    expect(value("dorado")).toHaveTextContent(/^Dorado · Gold1 artículo$/u);
    expect(value("plateado")).toHaveTextContent(/^Plateado3 artículos$/u);
    expect(screen.getByRole("list", { name: "Filtros de la tienda" })).toBe(
      screen.getByTestId("filter-list")
    );
    expect(
      screen.getByRole("button", { name: "Agregar filtro" })
    ).toBeVisible();
    expect(
      within(card("color")).getByRole("button", { name: "Subir: Color" })
    ).toBeDisabled();

    await press(card("color"), "Bajar: Color");

    expect(announcer()).toHaveTextContent("«Color» quedó en el lugar 2 de 3.");
  });
});
