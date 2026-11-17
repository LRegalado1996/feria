import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import type { Locale } from "@/lib/i18n/config";
import { ORDER_MOVES, type OrderStatus } from "@/lib/schemas/order";
import { renderWithI18n } from "@/test/i18n";
import { required } from "@/test/required";

import { OrderStepper, type OrderStepperProps } from "./order-stepper";

function setup({
  interactive = false,
  locale = "en",
  pendingMove = null,
  status = "packed",
  ...props
}: {
  interactive?: boolean;
  locale?: Locale;
  pendingMove?: OrderStatus | null;
  status?: OrderStatus;
} & Partial<
  Pick<OrderStepperProps, "className" | "classNames" | "tone">
> = {}) {
  const onMove = vi.fn<(to: OrderStatus) => void>();
  const user = userEvent.setup();
  const moves = interactive
    ? { code: "K7P2Q", onMove, pendingMove }
    : undefined;

  renderWithI18n(<OrderStepper moves={moves} status={status} {...props} />, {
    locale,
  });

  const list = () => screen.getByRole("list");
  const steps = () =>
    within(list())
      .getAllByRole("listitem")
      .map((step) => [step.dataset.status, step.dataset.state]);
  /** Every circle and the detour, by the move each makes. */
  const control = (move: OrderStatus) =>
    required(
      within(list())
        .getAllByRole("button")
        .find((button) => button.dataset.move === move)
    );
  const enabledMoves = () =>
    within(list())
      .getAllByRole("button")
      .filter((button) => !button.hasAttribute("aria-disabled"))
      .map((button) => button.dataset.move);

  return { control, enabledMoves, list, onMove, steps, user };
}

describe("OrderStepper", () => {
  test.each([
    [
      "received",
      "Order status: Received",
      [
        ["received", "current"],
        ["packed", "upcoming"],
        ["delivered", "upcoming"],
      ],
    ],
    [
      "packed",
      "Order status: Packed",
      [
        ["received", "done"],
        ["packed", "current"],
        ["delivered", "upcoming"],
      ],
    ],
    [
      "delivered",
      "Order status: Delivered",
      [
        ["received", "done"],
        ["packed", "done"],
        ["delivered", "current"],
      ],
    ],
    [
      "undeliverable",
      "Order status: Couldn't deliver",
      [
        ["received", "done"],
        ["packed", "done"],
        ["undeliverable", "current"],
      ],
    ],
  ] as const)(
    "a %s order: the list says it in words and marks each step",
    (status, name, expected) => {
      const { list, steps } = setup({ status });

      expect(list()).toHaveAccessibleName(name);
      expect(steps()).toEqual(expected);
    }
  );

  test.each([
    ["received", "received"],
    ["packed", "packed"],
    ["delivered", "delivered"],
    ["undeliverable", "undeliverable"],
  ] as const)(
    "a %s order puts aria-current=step on that step alone",
    (status, current) => {
      const { list } = setup({ status });

      const marked = within(list())
        .getAllByRole("listitem")
        .filter((step) => step.getAttribute("aria-current") === "step");

      expect(marked.map((step) => step.dataset.status)).toEqual([current]);
    }
  );

  test("says each step's progress in words, never in color alone", () => {
    const { list } = setup({ status: "packed" });

    expect(
      within(list())
        .getAllByRole("listitem")
        .map((step) => step.textContent)
    ).toEqual([
      "Received, done",
      "Packed, current status",
      "Delivered, to come",
    ]);
  });

  test("in Spanish, names the steps and their progress in Spanish", () => {
    const { list } = setup({ locale: "es", status: "undeliverable" });

    expect(list()).toHaveAccessibleName(
      "Estado del pedido: No se pudo entregar"
    );
    expect(
      within(list())
        .getAllByRole("listitem")
        .map((step) => step.textContent)
    ).toEqual([
      "Recibido, hecho",
      "Preparado, hecho",
      "No se pudo entregar, estado actual",
    ]);
  });

  test("the detour turns the last circle red, with an ✕", () => {
    setup({ status: "undeliverable" });

    const last = screen.getByTestId("order-step-undeliverable");
    const circle = last.querySelector('[data-slot="order-stepper-circle"]');

    expect(circle).toHaveClass("bg-red-100", "text-red-800");
    expect(circle?.querySelector("svg")).toHaveClass("lucide-x");
    expect(last.querySelector('[data-slot="order-stepper-label"]')).toHaveClass(
      "text-red-600"
    );
    expect(
      screen.queryByTestId("order-step-delivered")
    ).not.toBeInTheDocument();
  });

  test("colors the steps reached, rings the current one and greys the rest", () => {
    setup({ status: "packed" });

    const circle = (status: OrderStatus) =>
      screen
        .getByTestId(`order-step-${status}`)
        .querySelector('[data-slot="order-stepper-circle"]');

    expect(circle("received")).toHaveClass("bg-amber-100");
    expect(circle("received")).not.toHaveClass("ring-2");
    expect(circle("packed")).toHaveClass("bg-blue-100", "ring-2");
    expect(circle("delivered")).toHaveClass("border-dashed", "bg-card");
    expect(circle("delivered")).not.toHaveClass("bg-emerald-100");
  });

  test("read only, it holds no button at all", () => {
    const { list } = setup({ status: "packed" });

    expect(within(list()).queryAllByRole("button")).toEqual([]);
    expect(
      screen.getByTestId("order-step-packed").parentElement?.parentElement
    ).toHaveAttribute("data-mode", "read-only");
  });

  test("bare, it takes every color from its classNames", () => {
    setup({
      className: "custom",
      classNames: {
        circle: {
          current: "c-current",
          done: "c-done",
          failed: "c-failed",
          upcoming: "c-upcoming",
        },
        connector: { done: "l-done", upcoming: "l-upcoming" },
        label: { current: "t-current", failed: "t-failed" },
      },
      status: "undeliverable",
      tone: "bare",
    });

    const circle = (status: OrderStatus) =>
      screen
        .getByTestId(`order-step-${status}`)
        .querySelector('[data-slot="order-stepper-circle"]');
    const failed = circle("undeliverable");

    expect(circle("received")).toHaveClass("c-done");
    expect(circle("received")).not.toHaveClass("bg-amber-100");
    expect(failed).toHaveClass("c-current", "c-failed");
    expect(failed).not.toHaveClass("bg-red-100", "ring-2");
    expect(
      screen
        .getByTestId("order-step-undeliverable")
        .querySelector('[data-slot="order-stepper-label"]')
    ).toHaveClass("t-current", "t-failed");
    expect(
      screen
        .getByTestId("order-step-packed")
        .querySelector('[data-slot="order-stepper-connector"]')
    ).toHaveClass("l-done");
    expect(document.querySelector('[data-slot="order-stepper"]')).toHaveClass(
      "custom"
    );
  });

  test("the line into a step not reached is dashed", () => {
    setup({ status: "received" });

    expect(
      screen
        .getByTestId("order-step-packed")
        .querySelector('[data-slot="order-stepper-connector"]')
    ).toHaveClass("border-dashed");
  });
});

describe("OrderStepper with moves", () => {
  test.each([
    ["received"],
    ["packed"],
    ["delivered"],
    ["undeliverable"],
  ] as const)(
    "a %s order enables exactly the moves the order domain allows",
    (status) => {
      const { enabledMoves } = setup({ interactive: true, status });

      // Order apart: the same moves, none more, none fewer.
      expect(new Set(enabledMoves())).toEqual(new Set(ORDER_MOVES[status]));
      expect(enabledMoves()).toHaveLength(ORDER_MOVES[status].length);
    }
  );

  test("names every control by what it does, or why it cannot", () => {
    const { control } = setup({ interactive: true, status: "received" });

    expect(control("received")).toHaveAccessibleName(
      "Received: the current status"
    );
    expect(control("packed")).toHaveAccessibleName("Move to Packed");
    expect(control("delivered")).toHaveAccessibleName(
      "Delivered: it has to go through Packed first"
    );
    expect(control("undeliverable")).toHaveAccessibleName(
      "Couldn't deliver: it has to go through Packed first"
    );
    expect(control("delivered")).toHaveAttribute("aria-disabled", "true");
  });

  test("names a step back as one", () => {
    const { control } = setup({ interactive: true, status: "delivered" });

    expect(control("packed")).toHaveAccessibleName("Back to Packed");
    expect(control("received")).toHaveAccessibleName(
      "Received: it has to go through Packed first"
    );
  });

  test("asks before a move, and moves only once it is confirmed", async () => {
    const { control, onMove, user } = setup({ interactive: true });

    await user.click(control("delivered"));

    const dialog = screen.getByRole("dialog", {
      name: "Move the order to Delivered?",
    });
    expect(dialog).toHaveAccessibleDescription(
      "Order K7P2Q moves to “Delivered”, and the customer sees it on their order's page."
    );
    expect(onMove).not.toHaveBeenCalled();

    const confirm = within(dialog).getByRole("button", {
      name: "Yes, move to Delivered",
    });
    expect(confirm).toHaveAttribute("data-variant", "default");
    await user.click(confirm);

    expect(onMove).toHaveBeenCalledExactlyOnceWith("delivered");
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  test("cancelling moves nothing and hands focus back to the circle", async () => {
    const { control, onMove, user } = setup({ interactive: true });

    await user.click(control("received"));

    const dialog = screen.getByRole("dialog", {
      name: "Move the order back to Received?",
    });
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(onMove).not.toHaveBeenCalled();
    expect(control("received")).toHaveFocus();
  });

  test("a step back confirms in its own words", async () => {
    const { control, onMove, user } = setup({ interactive: true });

    await user.click(control("received"));
    await user.click(
      screen.getByRole("button", { name: "Yes, back to Received" })
    );

    expect(onMove).toHaveBeenCalledExactlyOnceWith("received");
  });

  test("the detour asks as the undeliverable move does, as a destructive one", async () => {
    const { control, onMove, user } = setup({ interactive: true });

    expect(control("undeliverable")).toHaveTextContent("Couldn't deliver");
    await user.click(control("undeliverable"));

    const dialog = screen.getByRole("dialog", {
      name: "Couldn't deliver the order?",
    });
    const confirm = within(dialog).getByRole("button", {
      name: "Yes, it couldn't be delivered",
    });
    expect(confirm).toHaveAttribute("data-variant", "destructive");
    await user.click(confirm);

    expect(onMove).toHaveBeenCalledExactlyOnceWith("undeliverable");
  });

  test.each([
    ["the current step", "packed"],
    ["a step it cannot reach yet", "delivered"],
  ] as const)("tapping %s opens nothing", async (_label, move) => {
    const { control, onMove, user } = setup({
      interactive: true,
      status: move === "packed" ? "packed" : "received",
    });

    await user.click(control(move));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(onMove).not.toHaveBeenCalled();
  });

  test("explains a disabled step in a tooltip on hover, the same words as its name", async () => {
    const { control, user } = setup({ interactive: true, status: "received" });

    await user.hover(control("delivered"));

    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "Delivered: it has to go through Packed first"
    );
  });

  test("shows its tooltip on keyboard focus too", async () => {
    const { control, user } = setup({ interactive: true, status: "received" });

    await user.tab();

    expect(control("received")).toHaveFocus();
    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "Received: the current status"
    );
  });

  test("while a move travels, every control waits and the moving one says so", async () => {
    const { control, enabledMoves, onMove, user } = setup({
      interactive: true,
      pendingMove: "delivered",
    });

    expect(enabledMoves()).toEqual([]);
    expect(control("delivered")).toHaveAccessibleName("Saving: Delivered");
    expect(control("delivered")?.querySelector("svg")).toHaveClass(
      "animate-spin"
    );

    await user.click(control("received"));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(onMove).not.toHaveBeenCalled();
  });

  test("a detour on its way spins the detour", () => {
    const { control } = setup({
      interactive: true,
      pendingMove: "undeliverable",
    });

    expect(control("undeliverable")).toHaveAccessibleName(
      "Saving: Couldn't deliver"
    );
    expect(control("undeliverable")?.querySelector("svg")).toHaveClass(
      "animate-spin"
    );
  });

  test("once the order could not be delivered, the detour is the last circle and offers nothing more", () => {
    const { list } = setup({ interactive: true, status: "undeliverable" });

    expect(
      list().querySelector('[data-slot="order-stepper-detour"]')
    ).not.toBeInTheDocument();
    expect(
      within(list())
        .getAllByRole("button")
        .map((button) => button.getAttribute("aria-label"))
    ).toEqual([
      "Received: it has to go through Packed first",
      "Back to Packed",
      "Couldn't deliver: the current status",
    ]);
  });

  test("in Spanish, asks in Spanish", async () => {
    const { control, user } = setup({ interactive: true, locale: "es" });

    expect(control("delivered")).toHaveAccessibleName("Pasar a Entregado");
    await user.click(control("delivered"));

    expect(
      screen.getByRole("dialog", { name: "¿Pasar el pedido a Entregado?" })
    ).toHaveAccessibleDescription(
      "El pedido K7P2Q pasa a «Entregado» y el cliente lo ve en la página de su pedido."
    );
    expect(
      screen.getByRole("button", { name: "Sí, pasar a Entregado" })
    ).toBeEnabled();
  });
});
