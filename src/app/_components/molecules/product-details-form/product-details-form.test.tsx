import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect } from "react";
import { type UseFormReturn, useForm } from "react-hook-form";
import { describe, expect, test, vi } from "vitest";

import { Form } from "@/app/_components/molecules/form";
import type { Locale } from "@/lib/i18n/config";
import type { ProductFormValues } from "@/lib/schemas/catalog";
import { makeStoreCategory } from "@/test/factories/store-category";
import { makeProductForm } from "@/test/factories/store-product";
import { DICTIONARIES, renderWithI18n } from "@/test/i18n";
import { required } from "@/test/required";

import {
  ProductDetailsForm,
  type ProductDetailsFormProps,
  type TextLanguage,
} from "./product-details-form";

/** Bijouterie, a group holding Anillos, and Burbujeros on its own. */
const CATEGORIES = [
  makeStoreCategory({
    id: 1,
    nameEn: "Jewellery",
    nameEs: "Bijouterie",
    slug: "bijouterie",
  }),
  makeStoreCategory({
    id: 2,
    nameEn: "Rings",
    nameEs: "Anillos",
    parentId: 1,
    position: 1,
    slug: "anillos",
  }),
  makeStoreCategory({
    id: 3,
    nameEn: null,
    nameEs: "Burbujeros",
    position: 2,
    slug: "burbujeros",
  }),
];

/**
 * The details inside the wizard's form, which the test reads back through
 * `form()`.
 */
function setup({
  assistant,
  categories = CATEGORIES,
  currency = "UYU",
  language = "es",
  locale = "en",
  values = makeProductForm(),
}: {
  assistant?: ProductDetailsFormProps["assistant"];
  categories?: ProductDetailsFormProps["categories"];
  currency?: ProductDetailsFormProps["currency"];
  language?: TextLanguage;
  locale?: Locale;
  values?: ProductFormValues;
} = {}) {
  const handle: { form: UseFormReturn<ProductFormValues> | null } = {
    form: null,
  };
  const onLanguageChange = vi.fn<(language: TextLanguage) => void>();

  function Harness({ shown }: { shown: TextLanguage }) {
    const form = useForm<ProductFormValues>({ defaultValues: values });

    useEffect(() => {
      handle.form = form;
    });

    return (
      <Form {...form}>
        <ProductDetailsForm
          assistant={assistant}
          categories={categories}
          currency={currency}
          language={shown}
          onLanguageChange={onLanguageChange}
        />
      </Form>
    );
  }

  const view = renderWithI18n(<Harness shown={language} />, { locale });

  return {
    form: () => required(handle.form).getValues(),
    onLanguageChange,
    showLanguage: (shown: TextLanguage) => {
      view.rerender(<Harness shown={shown} />);
    },
    user: userEvent.setup(),
  };
}

describe("ProductDetailsForm", () => {
  test("binds the title and the description to the language on screen", async () => {
    const { form, showLanguage, user } = setup();

    const title = screen.getByRole("textbox", { name: "Title" });
    expect(title).toHaveValue("Anillo de plata");
    await user.clear(title);
    await user.type(title, "Anillo sello");
    await user.type(
      screen.getByRole("textbox", { name: "Description" }),
      " Grabado."
    );

    expect(form().es).toMatchObject({
      description: "Plata 925. Grabado.",
      title: "Anillo sello",
    });

    showLanguage("en");
    await user.type(
      screen.getByRole("textbox", { name: "Title" }),
      "Signet ring"
    );

    expect(form().en.title).toBe("Signet ring");
    expect(form().es.title).toBe("Anillo sello");
    expect(
      screen.getByText(DICTIONARIES.en.articles.wizard.details.englishHint)
    ).toBeVisible();
  });

  test("says the English hint only on the English tab", () => {
    setup();

    expect(
      screen.queryByText(DICTIONARIES.en.articles.wizard.details.englishHint)
    ).toBeNull();
  });

  test("asks for the other language through its tab, leaving the switch to its owner", async () => {
    const { onLanguageChange, user } = setup();

    await user.click(screen.getByRole("tab", { name: "English (optional)" }));

    // Radix asks on the press and again on the focus that follows it.
    expect(new Set(onLanguageChange.mock.calls.flat())).toEqual(
      new Set(["en"])
    );
    expect(screen.getByRole("tab", { name: "Spanish" })).toHaveAttribute(
      "aria-selected",
      "true"
    );
  });

  test("offers each category, a group with its own option and its categories under it", () => {
    setup({ values: makeProductForm({ categoryId: "2" }) });

    const select = screen.getByRole("combobox", { name: "Category" });
    const group = required(
      within(select)
        .getAllByRole("group")
        .find((element) => element.getAttribute("label") === "Jewellery")
    );

    expect(
      within(group)
        .getAllByRole("option")
        .map((option) => [option.textContent, option.getAttribute("value")])
    ).toEqual([
      ["Jewellery (general)", "1"],
      ["Rings", "2"],
    ]);
    expect(
      within(select)
        .getAllByRole("option")
        .map((option) => option.textContent)
    ).toEqual([
      "Choose a category",
      "Jewellery (general)",
      "Rings",
      "Burbujeros",
    ]);
    expect(select).toHaveValue("2");
  });

  test("chooses a category by its id", async () => {
    const { form, user } = setup({
      values: makeProductForm({ categoryId: "" }),
    });

    await user.selectOptions(
      screen.getByRole("combobox", { name: "Category" }),
      "Rings"
    );

    expect(form().categoryId).toBe("2");
  });

  test.each([
    ["no category, says so", [], 1],
    ["categories, says nothing of it", CATEGORIES, 0],
  ] as const)("with %s under the field", (_case, categories, notes) => {
    setup({ categories });

    expect(screen.queryAllByText("There are no categories yet.")).toHaveLength(
      notes
    );
  });

  test.each([
    ["es", "12,50"],
    ["es", "12.50"],
    ["en", "12,50"],
    ["en", "12.50"],
  ] as const)(
    "on a page in %s, reads %s as twelve and a half",
    async (locale, typed) => {
      const { form, user } = setup({
        locale,
        values: makeProductForm({ price: null }),
      });
      const price = screen.getByRole("textbox", {
        name: DICTIONARIES[locale].articles.wizard.details.price,
      });

      await user.type(price, typed);

      expect(form().price).toBe(12.5);
    }
  );

  test.each([
    ["es", "UYU", "$", "En pesos uruguayos."],
    ["es", "USD", "US$", "En dólares."],
    ["en", "UYU", "UYU", "In Uruguayan pesos."],
    ["en", "USD", "USD", "In US dollars."],
  ] as const)(
    "in %s, shows %s inside the price field as %s, its name said as %j",
    (locale, currency, sign, said) => {
      setup({ currency, locale });
      const price = screen.getByRole("textbox", {
        description: said,
        name: DICTIONARIES[locale].articles.wizard.details.price,
      });

      expect(screen.getByTestId("product-price-currency")).toHaveTextContent(
        sign
      );
      expect(screen.getByTestId("product-price-currency")).toHaveAttribute(
        "aria-hidden",
        "true"
      );
      // The figure starts after the sign, however long the sign is.
      expect(price).toHaveClass(sign.length > 1 ? "pl-14" : "pl-7");
    }
  );

  test("writes no note on how to type the price", () => {
    setup({ locale: "es" });

    expect(screen.queryByText(/Podés escribir/u)).not.toBeInTheDocument();
  });

  test.each([
    ["the description", "textbox", "Description"],
    ["the category", "combobox", "Category"],
  ] as const)(
    "draws %s on the fields' own surface, never the page's",
    (_case, role, name) => {
      setup();

      expect(screen.getByRole(role, { name })).toHaveClass(
        "bg-background",
        "dark:bg-input/30"
      );
    }
  );

  test("marks the article available or not", async () => {
    const { form, user } = setup();

    await user.click(
      screen.getByRole("checkbox", { name: "Available to buy" })
    );

    expect(form().isAvailable).toBe(false);
  });

  test.each([
    [
      "given",
      <button key="ai" type="button">
        Fill with AI
      </button>,
      1,
    ],
    ["left out", undefined, 0],
  ])("places the assistant's slot when %s", (_case, assistant, count) => {
    setup({ assistant });

    expect(
      screen.queryAllByRole("button", { name: "Fill with AI" })
    ).toHaveLength(count);
  });

  test("has no search texts to fill in, nor filters: the wizard places those", () => {
    setup();

    expect(
      screen.queryByRole("textbox", { name: /search engine/iu })
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Gold" })).toBeNull();
    expect(
      screen.getAllByRole("textbox").map((box) => box.getAttribute("name"))
    ).toEqual(["es.title", "es.description", "price"]);
  });

  test("reads in Spanish on a Spanish page", () => {
    setup({ locale: "es" });

    expect(screen.getByRole("textbox", { name: "Título" })).toHaveValue(
      "Anillo de plata"
    );
    expect(
      screen.getByRole("combobox", { name: "Categoría" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: "Inglés (opcional)" })
    ).toBeVisible();
    expect(
      within(screen.getByRole("combobox", { name: "Categoría" }))
        .getAllByRole("option")
        .map((option) => option.textContent)
    ).toEqual([
      "Elegí una categoría",
      "Bijouterie (general)",
      "Anillos",
      "Burbujeros",
    ]);
  });
});
