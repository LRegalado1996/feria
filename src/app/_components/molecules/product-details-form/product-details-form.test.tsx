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

// Intl separates a currency from its amount with a no-break space.
const NBSP = " ";

const BLOB_PHOTO = {
  height: 900,
  url: "https://store.public.blob.vercel-storage.com/local/product/11111111-1111-4111-8111-111111111111.webp",
  width: 900,
};
const OWN_PHOTO = { height: 900, url: "/seed/ring-2.jpg", width: 900 };

const BLANK = { description: "", seoDescription: "", seoTitle: "", title: "" };

type StoreAttribute = ProductDetailsFormProps["attributes"][number];

function makeAttribute(
  overrides: Partial<StoreAttribute> = {}
): StoreAttribute {
  return {
    id: 5,
    nameEn: "Color",
    nameEs: "Color",
    position: 0,
    slug: "color",
    values: [
      {
        id: 31,
        nameEn: "Gold",
        nameEs: "Dorado",
        position: 0,
        productCount: 2,
        slug: "dorado",
        swatchColor: "#d4af37",
      },
      {
        id: 32,
        nameEn: "Silver",
        nameEs: "Plateado",
        position: 1,
        productCount: 0,
        slug: "plateado",
        swatchColor: null,
      },
    ],
    ...overrides,
  };
}

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
  language = "es",
  locale = "en",
  taglines = { en: "Jewellery at the fair.", es: "Bijouterie en la feria." },
  values = makeProductForm(),
}: {
  assistant?: ProductDetailsFormProps["assistant"];
  categories?: ProductDetailsFormProps["categories"];
  language?: TextLanguage;
  locale?: Locale;
  taglines?: ProductDetailsFormProps["seo"]["taglines"];
  values?: ProductFormValues;
} = {}) {
  const handle: { form: UseFormReturn<ProductFormValues> | null } = {
    form: null,
  };
  const onLanguageChange = vi.fn<(language: TextLanguage) => void>();
  const onCreateValue = vi.fn(
    async () => await Promise.resolve({ result: "saved" as const })
  );

  function Harness({ shown }: { shown: TextLanguage }) {
    const form = useForm<ProductFormValues>({ defaultValues: values });

    useEffect(() => {
      handle.form = form;
    });

    return (
      <Form {...form}>
        <ProductDetailsForm
          assistant={assistant}
          attributes={[makeAttribute()]}
          categories={categories}
          currency="UYU"
          language={shown}
          onCreateValue={onCreateValue}
          onLanguageChange={onLanguageChange}
          seo={{
            host: "lrmarket.uy",
            slug: "anillo-de-plata",
            storeName: "LR Market",
            taglines,
          }}
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

  test("says the store's currency under the price", () => {
    setup();

    expect(
      screen.getByText("In UYU. You can type 12,50 or 12.50.")
    ).toBeVisible();
  });

  test("marks the article available or not", async () => {
    const { form, user } = setup();

    await user.click(
      screen.getByRole("checkbox", { name: "Available to buy" })
    );

    expect(form().isAvailable).toBe(false);
  });

  test("chooses filter values by tapping them", async () => {
    const { form, user } = setup();

    await user.click(screen.getByRole("button", { name: "Silver" }));
    await user.click(screen.getByRole("button", { name: "Gold" }));

    expect(form().attributeValueIds).toEqual([32]);
  });

  test("counts what the search texts hold, trimmed, against their limits", async () => {
    const { user } = setup();
    await user.click(screen.getByText("Search and sharing"));

    await user.type(
      screen.getByRole("textbox", { name: "Search engine title" }),
      "  Anillo 925 "
    );

    expect(screen.getByText("10 of 70")).toBeVisible();
    expect(screen.getByText("0 of 160")).toBeVisible();
  });

  test("previews the Google result with the page's defaults: the title and store, the start of the description", () => {
    setup();

    const google = screen.getByTestId("product-seo-preview-google");

    expect(google).toHaveTextContent(
      [
        "LR Market",
        "lrmarket.uy › productos › anillo-de-plata",
        "Anillo de plata · LR Market",
        "Plata 925.",
      ].join("")
    );
  });

  test("previews the article's own search texts once typed", async () => {
    const { user } = setup();
    await user.click(screen.getByText("Search and sharing"));

    await user.type(
      screen.getByRole("textbox", { name: "Search engine title" }),
      "Anillo 925"
    );
    await user.type(
      screen.getByRole("textbox", { name: "Search engine description" }),
      "El que buscabas."
    );

    expect(screen.getByTestId("product-seo-preview-google")).toHaveTextContent(
      "Anillo 925 · LR MarketEl que buscabas."
    );
  });

  test.each([
    ["es", "Bijouterie en la feria."],
    ["en", "Jewellery at the fair."],
  ] as const)(
    "describes an article without a description by the store's tagline in %s",
    (language, tagline) => {
      setup({
        language,
        values: makeProductForm({
          en: { ...BLANK, title: "Silver ring" },
          es: { ...BLANK, title: "Anillo de plata" },
        }),
      });

      expect(
        screen.getByTestId("product-seo-preview-google")
      ).toHaveTextContent(tagline);
    }
  );

  test("previews the Spanish texts on the English tab while English has none, as the store does", () => {
    setup({ language: "en" });

    expect(screen.getByTestId("product-seo-preview-google")).toHaveTextContent(
      "Anillo de plata · LR Market"
    );
    expect(screen.getByTestId("store-share-preview")).toHaveTextContent(
      "Anillo de plata"
    );
  });

  test("previews the English texts on the English tab once there are some", () => {
    setup({
      language: "en",
      values: makeProductForm({ en: { ...BLANK, title: "Silver ring" } }),
    });

    expect(screen.getByTestId("product-seo-preview-google")).toHaveTextContent(
      "Silver ring · LR Market"
    );
  });

  test.each([
    // The no-break space Intl puts after the currency, read as a plain one.
    ["es", "LR MarketAnillo de plata$ 1.290"],
    ["en", "LR MarketAnillo de plataUYU 1,290"],
  ] as const)("in %s, the share card writes the price %s", (locale, price) => {
    setup({ locale });

    expect(
      screen
        .getByTestId("store-share-preview")
        .textContent?.replaceAll(NBSP, " ")
    ).toBe(price);
  });

  test("leaves the price off the share card while there is none", () => {
    setup({ values: makeProductForm({ price: null }) });

    expect(screen.getByTestId("store-share-preview")).not.toHaveTextContent(
      "UYU"
    );
  });

  test("draws a photo of this site on the share card, and says nothing of it", () => {
    setup({ values: makeProductForm({ images: [OWN_PHOTO] }) });

    expect(screen.getByTestId("store-share-preview-photo")).toHaveStyle({
      backgroundImage: 'url("/seed/ring-2.jpg")',
    });
    expect(
      screen.queryByText(
        DICTIONARIES.en.articles.wizard.details.seo.shareNoPhoto
      )
    ).toBeNull();
  });

  test("leaves an uploaded photo off the share card, as its renderer does, and says why", () => {
    setup({ values: makeProductForm({ images: [BLOB_PHOTO] }) });

    expect(
      screen.getByTestId("store-share-preview-photo").style.backgroundImage
    ).toBe("");
    expect(
      screen.getByText(DICTIONARIES.en.articles.wizard.details.seo.shareNoPhoto)
    ).toBeInTheDocument();
  });

  test("says nothing of the share card's photo while there is no photo", () => {
    setup({ values: makeProductForm({ images: [] }) });

    expect(
      screen.queryByText(
        DICTIONARIES.en.articles.wizard.details.seo.shareNoPhoto
      )
    ).toBeNull();
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
