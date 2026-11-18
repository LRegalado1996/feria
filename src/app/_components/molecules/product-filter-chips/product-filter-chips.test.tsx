import { act, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import type { AttributeFormResult } from "@/app/_components/molecules/attribute-form";
import type { Locale } from "@/lib/i18n/config";
import { renderWithI18n } from "@/test/i18n";

import {
  ProductFilterChips,
  type ProductFilterChipsProps,
} from "./product-filter-chips";

type StoreAttribute = ProductFilterChipsProps["attributes"][number];
type StoreValue = StoreAttribute["values"][number];

function makeValue(
  id: number,
  nameEs: string,
  overrides: Partial<StoreValue> = {}
): StoreValue {
  return {
    id,
    nameEn: null,
    nameEs,
    position: id,
    productCount: 0,
    slug: nameEs.toLowerCase(),
    swatchColor: null,
    ...overrides,
  };
}

function makeAttribute(
  overrides: Partial<StoreAttribute> = {}
): StoreAttribute {
  return {
    id: 1,
    nameEn: "Color",
    nameEs: "Color",
    position: 0,
    slug: "color",
    values: [
      makeValue(31, "Dorado", { nameEn: "Gold", swatchColor: "#d4af37" }),
      makeValue(32, "Plateado", { nameEn: "Silver", swatchColor: "#c0c0c0" }),
    ],
    ...overrides,
  };
}

interface SetupOptions {
  attributes?: ReturnType<typeof makeAttribute>[];
  created?: AttributeFormResult;
  locale?: Locale;
  value?: number[];
}

function setup({
  attributes = [
    makeAttribute(),
    makeAttribute({
      id: 2,
      nameEn: null,
      nameEs: "Material",
      slug: "material",
      values: [makeValue(41, "Plata")],
    }),
  ],
  created = "saved",
  locale = "en",
  value = [32],
}: SetupOptions = {}) {
  const onChange = vi.fn<(ids: number[]) => void>();
  const onCreateValue = vi.fn(async () => await Promise.resolve(created));
  const user = userEvent.setup();
  renderWithI18n(
    <ProductFilterChips
      attributes={attributes}
      onChange={onChange}
      onCreateValue={onCreateValue}
      value={value}
    />,
    { locale }
  );
  const filter = (name: string) => within(screen.getByRole("group", { name }));

  return { filter, onChange, onCreateValue, user };
}

describe("ProductFilterChips", () => {
  test("shows each filter as a group of chips, the chosen ones pressed, in the page's language", () => {
    const { filter } = setup();

    expect(
      filter("Color")
        .getAllByRole("button", { pressed: true })
        .map((chip) => chip.textContent)
    ).toEqual(["Silver"]);
    expect(
      filter("Color")
        .getAllByRole("button", { pressed: false })
        .map((chip) => chip.textContent)
    ).toEqual(["Gold"]);
    // A value with no English name shows the Spanish one.
    expect(
      filter("Material").getByRole("button", { name: "Plata" })
    ).toHaveAttribute("aria-pressed", "false");
  });

  test("draws a color's swatch beside its name, and none for a value without one", () => {
    const { filter } = setup();

    expect(
      filter("Color")
        .getByRole("button", { name: "Gold" })
        .querySelector("span[aria-hidden]")
    ).toHaveStyle({ backgroundColor: "#d4af37" });
    expect(
      filter("Material")
        .getByRole("button", { name: "Plata" })
        .querySelector("span[aria-hidden]")
    ).toBeNull();
  });

  test.each([
    ["chooses a value", "Gold", [32, 31]],
    ["drops a chosen value", "Silver", []],
  ])("%s with a tap", async (_case, name, expected) => {
    const { filter, onChange, user } = setup();

    await user.click(filter("Color").getByRole("button", { name }));

    expect(onChange).toHaveBeenCalledExactlyOnceWith(expected);
  });

  test("adds a value in place through its owner, which chooses it, and gives focus back to its button", async () => {
    const { filter, onChange, onCreateValue, user } = setup();
    const opener = filter("Color").getByRole("button", {
      name: "Add to Color",
    });

    await user.click(opener);
    expect(opener).toHaveAttribute("aria-expanded", "true");
    const form = screen.getByRole("form", { name: "New Color value" });
    expect(within(form).getByLabelText(/^Name in Spanish/u)).toHaveFocus();
    await user.type(within(form).getByLabelText(/^Name in Spanish/u), "Rosa");
    await user.click(within(form).getByRole("button", { name: "Add" }));

    expect(onCreateValue).toHaveBeenCalledExactlyOnceWith(1, {
      nameEn: null,
      nameEs: "Rosa",
      swatchColor: null,
    });
    // The owner chooses it, in its choice as it is when the store answers.
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByRole("form", { name: "New Color value" })).toBeNull();
    expect(opener).toHaveFocus();
    expect(opener).toHaveAttribute("aria-expanded", "false");
  });

  test("a value saved after another filter's form was opened leaves that form as it is", async () => {
    const onChange = vi.fn<(ids: number[]) => void>();
    let answer = (_result: "saved"): void => undefined;
    const onCreateValue = vi.fn(
      async () =>
        await new Promise<"saved">((resolve) => {
          answer = resolve;
        })
    );
    const user = userEvent.setup();
    renderWithI18n(
      <ProductFilterChips
        attributes={[
          makeAttribute(),
          makeAttribute({
            id: 2,
            nameEn: "Material",
            nameEs: "Material",
            slug: "material",
            values: [makeValue(41, "Plata")],
          }),
        ]}
        onChange={onChange}
        onCreateValue={onCreateValue}
        value={[]}
      />
    );
    await user.click(screen.getByRole("button", { name: "Add to Color" }));
    const color = screen.getByRole("form", { name: "New Color value" });
    await user.type(within(color).getByLabelText(/^Name in Spanish/u), "Rosa");
    await user.click(within(color).getByRole("button", { name: "Add" }));

    await user.click(screen.getByRole("button", { name: "Add to Material" }));
    const material = screen.getByRole("form", { name: "New Material value" });
    const name = within(material).getByLabelText(/^Name in Spanish/u);
    await user.type(name, "Oro");
    await act(async () => {
      answer("saved");
      await Promise.resolve();
    });

    expect(onCreateValue).toHaveBeenCalledExactlyOnceWith(1, {
      nameEn: null,
      nameEs: "Rosa",
      swatchColor: null,
    });
    expect(
      screen.getByRole("form", { name: "New Material value" })
    ).toBeInTheDocument();
    expect(name).toHaveValue("Oro");
    expect(name).toHaveFocus();
  });

  test("a value saved after its filter's form was closed and opened again leaves the new form as it is", async () => {
    const onChange = vi.fn<(ids: number[]) => void>();
    let answer = (_result: "saved"): void => undefined;
    const onCreateValue = vi.fn(
      async () =>
        await new Promise<"saved">((resolve) => {
          answer = resolve;
        })
    );
    const user = userEvent.setup();
    renderWithI18n(
      <ProductFilterChips
        attributes={[makeAttribute()]}
        onChange={onChange}
        onCreateValue={onCreateValue}
        value={[]}
      />
    );
    const opener = screen.getByRole("button", { name: "Add to Color" });
    await user.click(opener);
    const first = screen.getByRole("form", { name: "New Color value" });
    await user.type(within(first).getByLabelText(/^Name in Spanish/u), "Rosa");
    await user.click(within(first).getByRole("button", { name: "Add" }));

    // Closed by its button and opened again while the save is on its way.
    await user.click(opener);
    await user.click(opener);
    const name = within(
      screen.getByRole("form", { name: "New Color value" })
    ).getByLabelText(/^Name in Spanish/u);
    await user.type(name, "Coral");
    await act(async () => {
      answer("saved");
      await Promise.resolve();
    });

    expect(onCreateValue).toHaveBeenCalledExactlyOnceWith(1, {
      nameEn: null,
      nameEs: "Rosa",
      swatchColor: null,
    });
    expect(name).toHaveValue("Coral");
    expect(name).toHaveFocus();
  });

  test("keeps the form open with the reason when the name is taken, choosing nothing", async () => {
    const { filter, onChange, user } = setup({
      created: "duplicate",
    });

    await user.click(
      filter("Color").getByRole("button", { name: "Add to Color" })
    );
    const form = screen.getByRole("form", { name: "New Color value" });
    await user.type(within(form).getByLabelText(/^Name in Spanish/u), "Dorado");
    await user.click(within(form).getByRole("button", { name: "Add" }));

    expect(await within(form).findByRole("alert")).toHaveTextContent(
      "There is already one with that name here."
    );
    expect(onChange).not.toHaveBeenCalled();
  });

  test("cancelling the new value closes it and gives focus back", async () => {
    const { filter, onCreateValue, user } = setup();
    const opener = filter("Material").getByRole("button", {
      name: "Add to Material",
    });

    await user.click(opener);
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("form")).toBeNull();
    expect(opener).toHaveFocus();
    expect(onCreateValue).not.toHaveBeenCalled();
  });

  test("the add button closes the form it opened", async () => {
    const { filter, user } = setup();
    const opener = filter("Color").getByRole("button", {
      name: "Add to Color",
    });

    await user.click(opener);
    await user.click(opener);

    expect(screen.queryByRole("form")).toBeNull();
  });

  test("says when the store has no filters", () => {
    setup({ attributes: [] });

    expect(screen.getByText("The store has no filters yet.")).toBeVisible();
    expect(screen.queryByRole("group")).toBeNull();
  });

  test("in Spanish, shows the Spanish names and words", () => {
    const { filter } = setup({ locale: "es" });

    expect(
      filter("Color").getByRole("button", { name: "Plateado" })
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      filter("Color").getByRole("button", { name: "Agregar a Color" })
    ).toBeVisible();
  });
});
