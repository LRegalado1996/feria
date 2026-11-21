import { zodResolver } from "@hookform/resolvers/zod";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useForm } from "react-hook-form";
import { describe, expect, test, vi } from "vitest";

import type { Locale } from "@/lib/i18n/config";
import {
  createPageLayoutFormSchema,
  type PageLayoutFormFields,
  type PageSection,
  type SavePageLayoutValues,
} from "@/lib/schemas/page";
import { DICTIONARIES, renderWithI18n } from "@/test/i18n";

import {
  type PageLayoutBlockChoice,
  PageLayoutEditor,
  type PageLayoutEntry,
} from "./page-layout-editor";

/** What a page that is not the home can be given (FER-060). */
const BLOCKS: PageLayoutBlockChoice[] = [
  { name: "Rings", section: { categoryId: 4, kind: "category" } },
  { name: "Earrings", section: { categoryId: 5, kind: "category" } },
  { name: "Best sellers", section: { kind: "best_sellers" } },
  { name: "Featured", section: { kind: "featured" } },
];

/** Twelve published articles, `Article 1` to `Article 12`. */
const CHOICES = Array.from({ length: 12 }, (_value, index) => ({
  id: index + 1,
  name: `Article ${String(index + 1)}`,
}));

const NAMES: Record<string, string> = {
  banner: "Banner: Fair",
  best_sellers: "Best sellers",
  category: "Rings",
  featured: "Featured",
};

function describeSection(section: PageSection): PageLayoutEntry {
  return {
    name: NAMES[section.kind] ?? "",
    note:
      section.kind === "category" ? "No published articles: not shown" : null,
    warning: null,
  };
}

function describeArticle(id: number): PageLayoutEntry {
  return {
    name: `Article ${String(id)}`,
    note: null,
    warning: id === 3 ? "It is sold out" : null,
  };
}

function makeFields(
  overrides: Partial<PageLayoutFormFields> = {}
): PageLayoutFormFields {
  return {
    cover: [{ bannerId: 31 }, { bannerId: 32 }],
    featured: [],
    featuredPick: "",
    ranking: [{ productId: 3 }, { productId: 4 }],
    rankingPick: "",
    sections: [
      { section: { kind: "best_sellers" } },
      { section: { bannerId: 33, kind: "banner" } },
      { section: { categoryId: 4, kind: "category" } },
      { section: { kind: "featured" } },
    ],
    ...overrides,
  };
}

function Harness({
  blocks,
  fields,
  locale,
  onSave,
}: {
  blocks?: readonly PageLayoutBlockChoice[];
  fields: PageLayoutFormFields;
  locale: Locale;
  onSave: (values: SavePageLayoutValues) => Promise<boolean>;
}) {
  const form = useForm<PageLayoutFormFields, unknown, SavePageLayoutValues>({
    defaultValues: fields,
    resolver: zodResolver(
      createPageLayoutFormSchema(DICTIONARIES[locale].admin.home.layout.errors)
    ),
  });

  return (
    <>
      <PageLayoutEditor
        blocks={blocks}
        choices={CHOICES}
        describeArticle={describeArticle}
        describeBanner={(id) => ({
          name: `Banner ${String(id)}`,
          note: id === 32 ? "Off" : null,
          warning: null,
        })}
        describeSection={describeSection}
        form={form}
        id="home-layout"
        onSave={onSave}
      />
      <button form="home-layout" type="submit">
        Save order
      </button>
      {/* Whether the form differs from its start: a save makes it the start. */}
      <output data-testid="home-layout-dirty">
        {String(form.formState.isDirty)}
      </output>
    </>
  );
}

function setup({
  blocks,
  fields = makeFields(),
  locale = "en",
  saves = true,
}: {
  blocks?: readonly PageLayoutBlockChoice[];
  fields?: PageLayoutFormFields;
  locale?: Locale;
  saves?: boolean;
} = {}) {
  const onSave = vi.fn(
    async (_values: SavePageLayoutValues) => await Promise.resolve(saves)
  );
  renderWithI18n(
    <Harness blocks={blocks} fields={fields} locale={locale} onSave={onSave} />,
    { locale }
  );
  const user = userEvent.setup();
  const card = (testId: string) => screen.getByTestId(testId);
  const names = (testId: string) =>
    within(card(testId))
      .queryAllByTestId(`${testId}-item`)
      .map((item) => item.querySelector("p")?.textContent);

  return {
    card,
    dirty: () => screen.getByTestId("home-layout-dirty").textContent,
    names,
    onSave,
    submit: async () => {
      await user.click(screen.getByRole("button", { name: "Save order" }));
    },
    user,
  };
}

describe("PageLayoutEditor on a page that is not the home (FER-060)", () => {
  test("offers the blocks it does not have yet, and adds the one picked at the end", async () => {
    const { names, onSave, submit, user } = setup({ blocks: BLOCKS });
    const add = screen.getByTestId("page-add-block");
    const picker = within(add).getByRole("combobox", { name: "Block to add" });

    // Rings, the best sellers and the featured are on it already.
    expect(
      within(picker)
        .getAllByRole("option")
        .map((option) => option.textContent)
    ).toEqual(["Choose…", "Earrings"]);
    expect(
      within(add).getByRole("button", { name: "Add block" })
    ).toBeDisabled();

    await user.selectOptions(picker, "category:5");
    await user.click(within(add).getByRole("button", { name: "Add block" }));

    expect(names("home-layout-rows")).toEqual([
      "Best sellers",
      "Banner: Fair",
      "Rings",
      "Featured",
      "Rings",
    ]);
    expect(screen.getByText("No more blocks to add.")).toBeInTheDocument();

    await submit();

    expect(onSave.mock.calls[0]?.[0].sections).toEqual([
      { kind: "best_sellers" },
      { bannerId: 33, kind: "banner" },
      { categoryId: 4, kind: "category" },
      { kind: "featured" },
      { categoryId: 5, kind: "category" },
    ]);
  });

  test("takes out a row it was given; a banner leaves from its own form", async () => {
    const { names, onSave, submit, user } = setup({ blocks: BLOCKS });
    const rows = screen.getByTestId("home-layout-rows");

    expect(
      within(rows).queryByRole("button", { name: "Remove: Banner: Fair" })
    ).toBeNull();

    await user.click(
      within(rows).getByRole("button", { name: "Remove: Best sellers" })
    );

    expect(names("home-layout-rows")).toEqual([
      "Banner: Fair",
      "Rings",
      "Featured",
    ]);
    // Taken out, it is offered again.
    expect(
      within(screen.getByTestId("page-add-block"))
        .getAllByRole("option")
        .map((option) => option.textContent)
    ).toEqual(["Choose…", "Earrings", "Best sellers"]);

    await submit();

    expect(onSave.mock.calls[0]?.[0].sections).toEqual([
      { bannerId: 33, kind: "banner" },
      { categoryId: 4, kind: "category" },
      { kind: "featured" },
    ]);
  });

  test("the home is given no block and loses none: FER-020's rule fills it", () => {
    setup();

    expect(screen.queryByTestId("page-add-block")).toBeNull();
    expect(
      within(screen.getByTestId("home-layout-rows")).queryByRole("button", {
        name: /^Remove/u,
      })
    ).toBeNull();
  });

  test("says the curated lists are the same on every page", () => {
    setup({ blocks: BLOCKS });

    expect(screen.getByTestId("home-layout-best-sellers")).toHaveTextContent(
      "This list is the same on every page."
    );
    expect(screen.getByTestId("home-layout-featured")).toHaveTextContent(
      "This list is the same on every page."
    );
  });
});

describe("PageLayoutEditor", () => {
  test("lists the cover, the rows and the curated articles in their order, with what each says", () => {
    const { card, names } = setup();

    expect(names("home-layout-cover")).toEqual(["Banner 31", "Banner 32"]);
    expect(names("home-layout-rows")).toEqual([
      "Best sellers",
      "Banner: Fair",
      "Rings",
      "Featured",
    ]);
    expect(names("home-layout-best-sellers")).toEqual([
      "Article 3",
      "Article 4",
    ]);
    expect(card("home-layout-cover")).toHaveTextContent("Off");
    expect(card("home-layout-rows")).toHaveTextContent(
      "No published articles: not shown"
    );
    const [warning] = within(card("home-layout-best-sellers")).getAllByTestId(
      "home-layout-warning"
    );
    expect(warning).toHaveTextContent(/^It is sold out$/u);
    expect(card("home-layout-featured")).toHaveTextContent("None yet.");
  });

  test("an empty cover says so", () => {
    const { card } = setup({ fields: makeFields({ cover: [] }) });

    expect(card("home-layout-cover")).toHaveTextContent(
      "There are no banners in the cover."
    );
  });

  test("the first entry's up and the last one's down are aria-disabled, the others are not; the buttons say which entry", () => {
    setup();

    const state = (name: string) =>
      screen.getByRole("button", { name }).getAttribute("aria-disabled");

    expect(state("Move up: Best sellers")).toBe("true");
    expect(state("Move down: Best sellers")).toBeNull();
    expect(state("Move up: Featured")).toBeNull();
    expect(state("Move down: Featured")).toBe("true");
    expect(
      screen.getByRole("button", { name: "Move up: Featured" })
    ).toHaveClass("aria-disabled:opacity-50");
  });

  test("moving an entry to the bottom keeps focus on its button, and pressing it there does nothing", async () => {
    const { names, user } = setup();
    const down = screen.getByRole("button", { name: "Move down: Rings" });

    await user.click(down);

    expect(names("home-layout-rows")).toEqual([
      "Best sellers",
      "Banner: Fair",
      "Featured",
      "Rings",
    ]);
    expect(down).toHaveFocus();
    expect(down).toHaveAttribute("aria-disabled", "true");
    await user.keyboard("{Enter}");
    expect(names("home-layout-rows")).toEqual([
      "Best sellers",
      "Banner: Fair",
      "Featured",
      "Rings",
    ]);
    expect(down).toHaveFocus();
  });

  test("moving an entry to the top keeps focus on its button, and pressing it there does nothing", async () => {
    const { names, user } = setup();
    const up = screen.getByRole("button", { name: "Move up: Banner 32" });

    await user.click(up);

    expect(names("home-layout-cover")).toEqual(["Banner 32", "Banner 31"]);
    expect(up).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(names("home-layout-cover")).toEqual(["Banner 32", "Banner 31"]);
    expect(up).toHaveFocus();
  });

  test("moves the rows, the cover and the best sellers, and saves the new order", async () => {
    const { names, onSave, submit, user } = setup();

    await user.click(
      screen.getByRole("button", { name: "Move down: Best sellers" })
    );
    await user.click(screen.getByRole("button", { name: "Move up: Featured" }));
    await user.click(
      screen.getByRole("button", { name: "Move up: Banner 32" })
    );
    await user.click(
      screen.getByRole("button", { name: "Move down: Article 3" })
    );

    expect(names("home-layout-rows")).toEqual([
      "Banner: Fair",
      "Best sellers",
      "Featured",
      "Rings",
    ]);
    await submit();

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledExactlyOnceWith({
        coverBannerIds: [32, 31],
        featuredProductIds: [],
        rankingProductIds: [4, 3],
        sections: [
          { bannerId: 33, kind: "banner" },
          { kind: "best_sellers" },
          { kind: "featured" },
          { categoryId: 4, kind: "category" },
        ],
      });
    });
  });

  test("adds a picked article, offering only those not listed yet, and removes one", async () => {
    const { card, names, user } = setup();
    const best = within(card("home-layout-best-sellers"));
    const picker = best.getByRole("combobox", { name: "Article to add" });
    const add = best.getByRole("button", { name: "Add" });

    expect(add).toBeDisabled();
    expect(
      within(picker)
        .getAllByRole("option")
        .map((option) => option.textContent)
    ).not.toContain("Article 3");
    await user.selectOptions(picker, "7");
    await user.click(add);
    await user.click(best.getByRole("button", { name: "Remove: Article 3" }));

    expect(names("home-layout-best-sellers")).toEqual([
      "Article 4",
      "Article 7",
    ]);
    expect(picker).toHaveValue("");
  });

  test.each([
    ["home-layout-best-sellers", "ranking", 10],
    ["home-layout-featured", "featured", 4],
  ] as const)("%s is full at %s's cap of %s", (testId, name, max) => {
    const { card } = setup({
      fields: makeFields({
        [name]: CHOICES.slice(0, max).map((choice) => ({
          productId: choice.id,
        })),
      }),
    });
    const list = within(card(testId));

    expect(
      list.getByRole("combobox", { name: "Article to add" })
    ).toBeDisabled();
    expect(list.getByRole("button", { name: "Add" })).toBeDisabled();
    expect(
      list.getByText(
        `There are ${String(max)} already: remove one to add another.`
      )
    ).toBeInTheDocument();
  });

  test("one below the cap still takes another", () => {
    const { card } = setup({
      fields: makeFields({
        ranking: CHOICES.slice(0, 9).map((choice) => ({
          productId: choice.id,
        })),
      }),
    });

    expect(
      within(card("home-layout-best-sellers")).getByRole("combobox", {
        name: "Article to add",
      })
    ).toBeEnabled();
  });

  test("refuses a single featured article, saving nothing", async () => {
    const { card, onSave, submit } = setup({
      fields: makeFields({ featured: [{ productId: 5 }] }),
    });

    await submit();

    expect(
      await within(card("home-layout-featured")).findByRole("alert")
    ).toHaveTextContent("Choose none, or 2 to 4 featured articles.");
    expect(onSave).not.toHaveBeenCalled();
  });

  test.each([
    [
      "home-layout-cover",
      makeFields({ cover: [{ bannerId: 31 }, { bannerId: 31 }] }),
    ],
    [
      "home-layout-rows",
      makeFields({
        sections: [
          { section: { kind: "best_sellers" } },
          { section: { kind: "best_sellers" } },
        ],
      }),
    ],
  ])(
    "%s says it lists an entry twice, saving nothing",
    async (testId, fields) => {
      const { card, onSave, submit } = setup({ fields });

      await submit();

      expect(await within(card(testId)).findByRole("alert")).toHaveTextContent(
        /^A row or a banner is listed twice\. Reload the page to see the saved order\.$/u
      );
      expect(screen.getAllByRole("alert")).toHaveLength(1);
      expect(onSave).not.toHaveBeenCalled();
    }
  );

  test("once saved, holds the saved order as its start, the pickers cleared", async () => {
    const { card, dirty, names, onSave, submit, user } = setup({
      fields: makeFields({ featured: [{ productId: 5 }, { productId: 6 }] }),
    });
    const best = within(card("home-layout-best-sellers"));

    await user.click(best.getByRole("button", { name: "Remove: Article 4" }));
    await user.selectOptions(
      within(card("home-layout-featured")).getByRole("combobox", {
        name: "Article to add",
      }),
      "9"
    );
    expect(dirty()).toBe("true");
    await submit();

    // The picker's article is not added: only what the lists hold is saved.
    await waitFor(() => {
      expect(onSave).toHaveBeenCalledExactlyOnceWith({
        coverBannerIds: [31, 32],
        featuredProductIds: [5, 6],
        rankingProductIds: [3],
        sections: [
          { kind: "best_sellers" },
          { bannerId: 33, kind: "banner" },
          { categoryId: 4, kind: "category" },
          { kind: "featured" },
        ],
      });
    });
    expect(names("home-layout-best-sellers")).toEqual(["Article 3"]);
    expect(names("home-layout-featured")).toEqual(["Article 5", "Article 6"]);
    expect(
      within(card("home-layout-featured")).getByRole("combobox", {
        name: "Article to add",
      })
    ).toHaveValue("");
    expect(dirty()).toBe("false");
  });

  test("keeps the order when the save fails", async () => {
    const { dirty, names, onSave, submit, user } = setup({ saves: false });

    await user.click(
      screen.getByRole("button", { name: "Move down: Best sellers" })
    );
    await submit();

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledExactlyOnceWith({
        coverBannerIds: [31, 32],
        featuredProductIds: [],
        rankingProductIds: [3, 4],
        sections: [
          { bannerId: 33, kind: "banner" },
          { kind: "best_sellers" },
          { categoryId: 4, kind: "category" },
          { kind: "featured" },
        ],
      });
    });
    expect(names("home-layout-rows")).toEqual([
      "Banner: Fair",
      "Best sellers",
      "Rings",
      "Featured",
    ]);
    expect(dirty()).toBe("true");
  });

  test("speaks Spanish on a Spanish page", () => {
    setup({ locale: "es" });

    expect(
      screen.getByRole("form", { name: "Orden de la página" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Más vendidos" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Subir: Featured" })
    ).toBeEnabled();
  });
});
