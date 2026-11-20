import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import type { WizardStep } from "@/lib/admin/products";
import type { Locale } from "@/lib/i18n/config";
import { renderWithI18n } from "@/test/i18n";

import { ProductWizardSteps } from "./product-wizard-steps";

function setup({
  current = "details",
  locale = "en",
  reachable = ["photos", "details", "review"],
}: { current?: WizardStep; locale?: Locale; reachable?: WizardStep[] } = {}) {
  const onSelect = vi.fn<(step: WizardStep) => void>();
  const user = userEvent.setup();
  renderWithI18n(
    <ProductWizardSteps
      current={current}
      isReachable={(step) => reachable.includes(step)}
      onSelect={onSelect}
    />,
    { locale }
  );
  const step = (name: string) => screen.getByRole("button", { name });

  return { onSelect, step, user };
}

describe("ProductWizardSteps", () => {
  test("names the steps' list and each step by its place and name", () => {
    setup();

    expect(
      screen.getByRole("navigation", { name: "Steps to load the article" })
    ).toBeInTheDocument();
    expect(
      screen
        .getAllByRole("button")
        .map((button) => button.getAttribute("aria-label"))
    ).toEqual([
      "Step 1 of 3: Photos",
      "Step 2 of 3: Details",
      "Step 3 of 3: Review",
    ]);
  });

  test.each([
    ["photos", "Step 1 of 3: Photos"],
    ["details", "Step 2 of 3: Details"],
    ["review", "Step 3 of 3: Review"],
  ] as const)("marks %s, and only it, as the current step", (current, name) => {
    setup({ current });

    expect(
      screen
        .getAllByRole("button")
        .filter((button) => button.getAttribute("aria-current") === "step")
        .map((button) => button.getAttribute("aria-label"))
    ).toEqual([name]);
  });

  test("checks off the steps before the current one, and numbers the rest", () => {
    const { step } = setup({ current: "review" });

    expect(step("Step 1 of 3: Photos").querySelector("svg")).not.toBeNull();
    expect(step("Step 2 of 3: Details").querySelector("svg")).not.toBeNull();
    expect(step("Step 3 of 3: Review")).toHaveTextContent("3");
    expect(step("Step 3 of 3: Review").querySelector("svg")).toBeNull();
  });

  test("opens a step it is told to", async () => {
    const { onSelect, step, user } = setup();

    await user.click(step("Step 3 of 3: Review"));

    expect(onSelect).toHaveBeenCalledExactlyOnceWith("review");
  });

  test("keeps a step that cannot be opened yet shut", async () => {
    const { onSelect, step, user } = setup({
      current: "photos",
      reachable: ["photos"],
    });

    expect(step("Step 2 of 3: Details")).toBeDisabled();
    expect(step("Step 1 of 3: Photos")).toBeEnabled();
    await user.click(step("Step 2 of 3: Details"));
    expect(onSelect).not.toHaveBeenCalled();
  });

  test("in Spanish, says the steps in Spanish", () => {
    setup({ locale: "es" });

    expect(
      screen.getByRole("navigation", { name: "Pasos para cargar el artículo" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Paso 2 de 3: Datos" })
    ).toHaveAttribute("aria-current", "step");
  });
});
