import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import type { Locale } from "@/lib/i18n/config";
import { DICTIONARIES } from "@/test/i18n";

import { StoreSearchForm } from "./store-search-form";

function setup({
  id = "store-search",
  locale = "en",
}: { id?: string; locale?: Locale } = {}) {
  const { container } = render(
    <StoreSearchForm
      className="custom"
      copy={DICTIONARIES[locale].storefront.shell}
      id={id}
      locale={locale}
    />
  );

  return {
    container,
    form: () => {
      const form = container.querySelector("form");

      if (!form) {
        throw new Error("No form");
      }

      return form;
    },
    input: (name = "Search the store") =>
      screen.getByRole("searchbox", { name }),
  };
}

describe("StoreSearchForm", () => {
  test.each([
    ["en", "/en/products", "Search the store", "Search", "Search…"],
    ["es", "/products", "Buscar en la tienda", "Buscar", "Buscar…"],
  ] as const)(
    "in %s, sends a GET to %s with the text as q",
    (locale, action, label, submit, placeholder) => {
      const { form, input } = setup({ locale });

      expect(form()).toHaveAttribute("action", action);
      expect(form()).toHaveAttribute("method", "get");
      expect(input(label)).toHaveAttribute("name", "q");
      expect(input(label)).toHaveAttribute("placeholder", placeholder);
      expect(screen.getByRole("button", { name: submit })).toHaveAttribute(
        "type",
        "submit"
      );
    }
  );

  test("takes up to 100 characters", () => {
    const { input } = setup();

    expect(input()).toHaveAttribute("maxlength", "100");
  });

  test.each(["store-search", "store-search-menu"])(
    "labels its input by the id %s it is given",
    (id) => {
      const { input } = setup({ id });

      expect(input()).toHaveAttribute("id", id);
    }
  );

  test("sits in a search landmark", () => {
    const { container, form } = setup();

    // The `<search>` element is the landmark itself; the DOM library here
    // does not map it to the role yet, so it is read by its tag.
    const landmark = container.firstElementChild;
    expect(landmark?.tagName).toBe("SEARCH");
    expect(landmark).toContainElement(form());
    expect(landmark).toHaveClass("custom");
    expect(landmark).toHaveAttribute("data-slot", "store-search-form");
  });
});
