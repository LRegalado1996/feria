import { screen, within } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import type { Locale } from "@/lib/i18n/config";
import type { OrderStatus } from "@/lib/schemas/order";
import { renderWithI18n } from "@/test/i18n";

import { StoreOrderStepper } from "./store-order-stepper";

function setup({
  locale = "en",
  status = "packed",
}: { locale?: Locale; status?: OrderStatus } = {}) {
  renderWithI18n(<StoreOrderStepper className="custom" status={status} />, {
    locale,
  });

  const circle = (step: OrderStatus) =>
    screen
      .getByTestId(`order-step-${step}`)
      .querySelector('[data-slot="order-stepper-circle"]');

  return { circle, list: () => screen.getByRole("list") };
}

describe("StoreOrderStepper", () => {
  test("shows the shopper where the order is, read only", () => {
    const { list } = setup();

    expect(list()).toHaveAccessibleName("Order status: Packed");
    expect(within(list()).queryAllByRole("button")).toEqual([]);
    expect(
      document.querySelector('[data-slot="order-stepper"]')
    ).toHaveAttribute("data-tone", "bare");
    expect(document.querySelector('[data-slot="order-stepper"]')).toHaveClass(
      "custom"
    );
  });

  test("in the store's colors, never the admin's", () => {
    const { circle } = setup();

    expect(circle("received")).toHaveClass("bg-store-contrast");
    expect(circle("packed")).toHaveClass("bg-store-foreground", "outline-2");
    expect(circle("delivered")).toHaveClass(
      "border-dashed",
      "border-store-line"
    );
    expect(circle("received")).not.toHaveClass("bg-amber-100");
  });

  test("an order that could not be delivered ends in the store's danger color", () => {
    const { circle } = setup({ locale: "es", status: "undeliverable" });

    expect(circle("undeliverable")).toHaveClass(
      "bg-store-danger",
      "text-store-background"
    );
    // The current step's ink gives way to the danger fill.
    expect(circle("undeliverable")).not.toHaveClass("bg-store-foreground");
    expect(screen.getByRole("list")).toHaveAccessibleName(
      "Estado del pedido: No se pudo entregar"
    );
  });
});
