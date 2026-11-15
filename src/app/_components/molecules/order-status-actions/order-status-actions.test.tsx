import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import type { Locale } from "@/lib/i18n/config";
import type { OrderStatus } from "@/lib/schemas/order";
import { renderWithI18n } from "@/test/i18n";

import { OrderStatusActions } from "./order-status-actions";

function setup({
  locale = "en",
  pendingMove = null,
  status = "packed",
}: {
  locale?: Locale;
  pendingMove?: OrderStatus | null;
  status?: OrderStatus;
} = {}) {
  const onMove = vi.fn<(to: OrderStatus) => void>();
  const user = userEvent.setup();
  const view = renderWithI18n(
    <OrderStatusActions
      className="custom"
      code="K7P2Q"
      onMove={onMove}
      pendingMove={pendingMove}
      status={status}
    />,
    { locale }
  );
  const group = () =>
    screen.getByRole("group", {
      name:
        locale === "en"
          ? "Change the order's status"
          : "Cambiar el estado del pedido",
    });
  const buttons = () =>
    within(group())
      .getAllByRole("button")
      .map((button) => [button.textContent, button.dataset.variant]);

  return {
    buttons,
    group,
    onMove,
    rerender: (next: {
      pendingMove?: OrderStatus | null;
      status: OrderStatus;
    }) => {
      view.rerender(
        <OrderStatusActions
          className="custom"
          code="K7P2Q"
          onMove={onMove}
          pendingMove={next.pendingMove ?? null}
          status={next.status}
        />
      );
    },
    user,
  };
}

describe("OrderStatusActions", () => {
  test.each([
    ["received", [["Mark packed", "default"]]],
    [
      "packed",
      [
        ["Mark delivered", "default"],
        ["Couldn't deliver", "outline"],
        ["Back to received", "secondary"],
      ],
    ],
    ["delivered", [["Back to packed", "secondary"]]],
    ["undeliverable", [["Back to packed", "secondary"]]],
  ] as const)(
    "a %s order offers only its allowed moves, forward first",
    (status, expected) => {
      const { buttons, group } = setup({ status });

      expect(buttons()).toEqual(expected);
      expect(group()).toHaveAttribute("data-slot", "order-status-actions");
      expect(group()).toHaveClass("custom");
    }
  );

  test("in Spanish, names each move in Spanish", () => {
    const { buttons } = setup({ locale: "es" });

    expect(buttons().map(([label]) => label)).toEqual([
      "Marcar entregado",
      "No se pudo entregar",
      "Volver a recibido",
    ]);
  });

  test("moves at once on one tap", async () => {
    const { onMove, user } = setup({ status: "received" });

    await user.click(screen.getByRole("button", { name: "Mark packed" }));

    expect(onMove).toHaveBeenCalledExactlyOnceWith("packed");
  });

  test.each([
    ["Back to received", "received"],
    ["Mark delivered", "delivered"],
  ] as const)("%s moves the order to %s", async (name, to) => {
    const { onMove, user } = setup();

    await user.click(screen.getByRole("button", { name }));

    expect(onMove).toHaveBeenCalledExactlyOnceWith(to);
  });

  test("asks before marking it undeliverable, and moves only on confirm", async () => {
    const { onMove, user } = setup();

    await user.click(screen.getByRole("button", { name: "Couldn't deliver" }));

    const dialog = screen.getByRole("dialog", {
      name: "Couldn't deliver the order?",
    });
    expect(dialog).toHaveTextContent(
      "Order K7P2Q moves to “Couldn't deliver”, and the customer sees it on their order's page."
    );
    expect(onMove).not.toHaveBeenCalled();

    await user.click(
      within(dialog).getByRole("button", {
        name: "Yes, it couldn't be delivered",
      })
    );

    expect(onMove).toHaveBeenCalledExactlyOnceWith("undeliverable");
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(
      screen.getByRole("button", { name: "Couldn't deliver" })
    ).toHaveFocus();
  });

  test("cancelling the question moves nothing and gives focus back", async () => {
    const { onMove, user } = setup();

    await user.click(screen.getByRole("button", { name: "Couldn't deliver" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(onMove).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Couldn't deliver" })
    ).toHaveFocus();
  });

  test("while a move is on its way, says so on its button and refuses more taps, keeping focus", async () => {
    const { onMove, rerender, user } = setup();
    const tapped = screen.getByRole("button", { name: "Mark delivered" });

    await user.click(tapped);
    rerender({ pendingMove: "delivered", status: "packed" });

    expect(tapped).toHaveTextContent(/^Saving…$/u);
    expect(tapped).toHaveFocus();
    expect(
      within(screen.getByRole("group"))
        .getAllByRole("button")
        .map((button) => button.getAttribute("aria-disabled"))
    ).toEqual(["true", "true", "true"]);
    expect(tapped).toBeEnabled();

    await user.click(tapped);
    await user.click(screen.getByRole("button", { name: "Couldn't deliver" }));

    expect(onMove).toHaveBeenCalledExactlyOnceWith("delivered");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  test("with no move on its way, no button is aria-disabled", () => {
    setup();

    expect(
      within(screen.getByRole("group"))
        .getAllByRole("button")
        .map((button) => button.getAttribute("aria-disabled"))
    ).toEqual([null, null, null]);
  });

  test("once the order lands in its new status, focus goes to its first action", async () => {
    const { rerender, user } = setup({ status: "received" });

    await user.click(screen.getByRole("button", { name: "Mark packed" }));
    rerender({ pendingMove: "packed", status: "received" });
    rerender({ status: "packed" });

    expect(
      screen.getByRole("button", { name: "Mark delivered" })
    ).toHaveFocus();
  });

  test("a status changed elsewhere (another staff member) does not take focus", () => {
    const { rerender } = setup({ status: "received" });

    rerender({ status: "packed" });

    expect(document.body).toHaveFocus();
  });
});
