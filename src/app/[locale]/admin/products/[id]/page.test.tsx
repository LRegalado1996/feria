import { describe, expect, test, vi } from "vitest";

import { ProductWizardPage, WIZARD_VIEWPORT } from "../product-wizard-page";
import ProductPage, { viewport } from "./page";

// The shared page has its own tests; here only that this address is it.
vi.mock("../product-wizard-page", () => ({
  ProductWizardPage: () => null,
  WIZARD_VIEWPORT: { interactiveWidget: "resizes-content" },
}));

describe("ProductPage", () => {
  test("is the article wizard's page, with its viewport", () => {
    expect(ProductPage).toBe(ProductWizardPage);
    expect(viewport).toBe(WIZARD_VIEWPORT);
  });
});
