import { zodResolver } from "@hookform/resolvers/zod";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useForm } from "react-hook-form";
import { describe, expect, test, vi } from "vitest";

import type { Locale } from "@/lib/i18n/config";
import {
  createHomeLayoutFormSchema,
  type HomeLayoutFormFields,
  type HomeSection,
  type SaveHomeLayoutValues,
} from "@/lib/schemas/home";
import { DICTIONARIES, renderWithI18n } from "@/test/i18n";

import { HomeLayoutEditor, type HomeLayoutEntry } from "./home-layout-editor";

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

function describeSection(section: HomeSection): HomeLayoutEntry {
  return {
    name: NAMES[section.kind] ?? "",
    note:
      section.kind === "category" ? "No published articles: not shown" : null,
    warning: null,
  };
}

function describeArticle(id: number): HomeLayoutEntry {
  return {
    name: `Article ${String(id)}`,
    note: null,
    warning: id === 3 ? "It is sold out" : null,
  };
}

function makeFields(
  overrides: Partial<HomeLayoutFormFields> = {}
): HomeLayoutFormFields {
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
  fields,
  locale,
  onSave,
}: {
  fields: HomeLayoutFormFields;
  locale: Locale;
  onSave: (values: SaveHomeLayoutValues) => Promise<boolean>;
}) {
  const form = useForm<HomeLayoutFormFields, unknown, SaveHomeLayoutValues>({
    defaultValues: fields,
    resolver: zodResolver(
      createHomeLayoutFormSchema(DICTIONARIES[locale].admin.home.layout.errors)
    ),
  });

  return (
    <>
      <HomeLayoutEditor
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
    </>
  );
}

function setup({
  fields = makeFields(),
  locale = "en",
  saves = true,
}: {
  fields?: HomeLayoutFormFields;
  locale?: Locale;
  saves?: boolean;
} = {}) {
  const onSave = vi.fn(
    async (_values: SaveHomeLayoutValues) => await Promise.resolve(saves)
  );
  renderWithI18n(<Harness fields={fields} locale={locale} onSave={onSave} />, {
    locale,
  });
  const user = userEvent.setup();
  const card = (testId: string) => screen.getByTestId(testId);
  const names = (testId: string) =>
    within(card(testId))
      .queryAllByTestId(`${testId}-item`)
      .map((item) => item.querySelector("p")?.textContent);

  return {
    card,
    names,
    onSave,
    submit: async () => {
      await user.click(screen.getByRole("button", { name: "Save order" }));
    },
    user,
  };
}

describe("HomeLayoutEditor", () => {
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

  test("cannot move the first entry up nor the last one down; the buttons say which entry", () => {
    setup();

    expect(
      screen.getByRole("button", { name: "Move up: Best sellers" })
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Move down: Best sellers" })
    ).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "Move down: Featured" })
    ).toBeDisabled();
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

  test("once saved, holds the saved order as its start, the pickers cleared", async () => {
    const { card, names, onSave, submit, user } = setup({
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
    await submit();

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledOnce();
    });
    expect(names("home-layout-best-sellers")).toEqual(["Article 3"]);
    expect(names("home-layout-featured")).toEqual(["Article 5", "Article 6"]);
    expect(
      within(card("home-layout-featured")).getByRole("combobox", {
        name: "Article to add",
      })
    ).toHaveValue("");
  });

  test("keeps the order when the save fails", async () => {
    const { names, onSave, submit, user } = setup({ saves: false });

    await user.click(
      screen.getByRole("button", { name: "Move down: Best sellers" })
    );
    await submit();

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledOnce();
    });
    expect(names("home-layout-rows")?.[1]).toBe("Best sellers");
  });

  test("speaks Spanish on a Spanish page", () => {
    setup({ locale: "es" });

    expect(
      screen.getByRole("form", { name: "Orden del inicio" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Más vendidos" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Subir: Featured" })
    ).toBeEnabled();
  });
});
