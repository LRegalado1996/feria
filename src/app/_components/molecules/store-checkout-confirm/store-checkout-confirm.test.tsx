import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRef, useState } from "react";
import { describe, expect, test, vi } from "vitest";

import type { Locale } from "@/lib/i18n/config";
import { DICTIONARIES, renderWithI18n } from "@/test/i18n";

import {
  StoreCheckoutConfirm,
  type StoreCheckoutConfirmProps,
} from "./store-checkout-confirm";

type Overrides = Partial<
  Pick<
    StoreCheckoutConfirmProps,
    "name" | "phone" | "sending" | "total" | "units"
  >
>;

/**
 * The dialog as the checkout form holds it: opened from a button, closed by
 * its own `onBack`, which the form answers by closing it.
 */
function Harness({
  onBack,
  onConfirm,
  overrides,
}: {
  onBack: () => void;
  onConfirm: () => void;
  overrides: Overrides;
}) {
  const [open, setOpen] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);

  return (
    <>
      <button
        onClick={() => {
          setOpen(true);
        }}
        ref={opener}
        type="button"
      >
        Place the order
      </button>
      <input aria-label="Your name" />
      <StoreCheckoutConfirm
        name="Ana Pérez"
        onBack={() => {
          onBack();
          setOpen(false);
        }}
        onConfirm={onConfirm}
        open={open}
        phone="099 123 456"
        returnFocus={opener}
        sending={false}
        total={{ amount: 330_000, currency: "UYU" }}
        units={3}
        {...overrides}
      />
    </>
  );
}

function setup({
  locale = "en",
  ...overrides
}: Overrides & { locale?: Locale } = {}) {
  const onBack = vi.fn(() => undefined);
  const onConfirm = vi.fn(() => undefined);
  const user = userEvent.setup();
  renderWithI18n(
    <Harness onBack={onBack} onConfirm={onConfirm} overrides={overrides} />,
    { locale }
  );
  const copy = DICTIONARIES[locale].storefront.cart.confirm;

  return {
    copy,
    dialog: () => screen.getByRole("dialog", { name: copy.title }),
    onBack,
    onConfirm,
    open: async () => {
      // Focus starts in a field: the confirmation opens from Enter there
      // as well as from the button.
      await user.click(screen.getByRole("textbox", { name: "Your name" }));
      await user.click(screen.getByRole("button", { name: "Place the order" }));
    },
    opener: () => screen.getByRole("button", { name: "Place the order" }),
    panel: () => screen.queryByTestId("store-checkout-confirm"),
    /** The summary's rows, as label and value. */
    rows: () =>
      within(screen.getByTestId("store-checkout-confirm-summary"))
        .getAllByRole("term")
        .map((term) => [
          term.textContent,
          term.nextElementSibling?.textContent,
        ]),
    user,
  };
}

describe("StoreCheckoutConfirm", () => {
  test("is not on the page while closed", () => {
    const { panel } = setup();

    expect(panel()).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  test.each([
    [
      "en",
      "Confirm your order?",
      [
        ["Units", "3"],
        ["Total", "UYU 3,300"],
        ["Name", "Ana Pérez"],
        ["Mobile", "099 123 456"],
      ],
      ["Confirm order", "Go back"],
    ],
    [
      "es",
      "¿Confirmás el pedido?",
      [
        ["Unidades", "3"],
        ["Total", "$ 3.300"],
        ["Nombre", "Ana Pérez"],
        ["Celular", "099 123 456"],
      ],
      ["Confirmar pedido", "Volver"],
    ],
  ] as const)(
    "in %s, is a dialog titled %j summing up the order, with its two actions",
    async (locale, title, rows, actions) => {
      const t = setup({ locale });

      await t.open();

      expect(t.dialog()).toHaveAccessibleName(title);
      expect(t.dialog()).toHaveAccessibleDescription(t.copy.description);
      expect(t.rows()).toEqual(rows);
      expect(
        within(t.dialog())
          .getAllByRole("button")
          .map((button) => button.textContent)
      ).toEqual(actions);
    }
  );

  test("counts a thousand units with the language's grouping, and has no total row without a total", async () => {
    const { open, rows } = setup({ total: null, units: 1200 });

    await open();

    expect(rows()).toEqual([
      ["Units", "1,200"],
      ["Name", "Ana Pérez"],
      ["Mobile", "099 123 456"],
    ]);
  });

  test("the main pill confirms, the outline one goes back; both are as wide as the dialog", async () => {
    const { dialog, open } = setup();

    await open();

    const [confirm, back] = within(dialog()).getAllByRole("button");
    expect(confirm).toHaveAttribute("data-variant", "primary");
    expect(confirm).toHaveAttribute("type", "button");
    expect(confirm).toHaveClass("w-full");
    expect(back).toHaveAttribute("data-variant", "outline");
    expect(back).toHaveAttribute("type", "button");
    expect(back).toHaveClass("w-full");
  });

  test("starts focus on Go back, the choice that sends nothing, and keeps it inside", async () => {
    const { dialog, open, user } = setup();

    await open();

    const back = within(dialog()).getByRole("button", { name: "Go back" });
    expect(back).toHaveFocus();
    await user.tab();
    expect(
      within(dialog()).getByRole("button", { name: "Confirm order" })
    ).toHaveFocus();
    await user.tab();
    expect(back).toHaveFocus();
  });

  test("Confirm order hands the confirmation over and nothing else", async () => {
    const { dialog, onBack, onConfirm, open, user } = setup();

    await open();
    await user.click(
      within(dialog()).getByRole("button", { name: "Confirm order" })
    );

    expect(onConfirm).toHaveBeenCalledExactlyOnceWith();
    expect(onBack).not.toHaveBeenCalled();
  });

  test.each([
    ["Go back", "click"],
    ["Escape", "escape"],
  ] as const)(
    "%s goes back, and focus returns to the button that submits, not the field it came from",
    async (_case, how) => {
      const { dialog, onBack, onConfirm, open, opener, panel, user } = setup();

      await open();
      await (how === "click"
        ? user.click(within(dialog()).getByRole("button", { name: "Go back" }))
        : user.keyboard("{Escape}"));

      expect(onBack).toHaveBeenCalledExactlyOnceWith();
      expect(onConfirm).not.toHaveBeenCalled();
      await waitFor(() => {
        expect(panel()).toBeNull();
      });
      expect(opener()).toHaveFocus();
    }
  );

  test("a tap on the scrim leaves it open: the second tap of a double tap lands there", async () => {
    const { dialog, onBack, open, user } = setup();

    await open();
    await user.click(screen.getByTestId("dialog-overlay"));

    expect(onBack).not.toHaveBeenCalled();
    expect(dialog()).toBeVisible();
  });

  test.each([
    ["en", "Sending the order…"],
    ["es", "Enviando el pedido…"],
  ] as const)(
    "in %s, while the order is sent it says %j, holds both actions and nothing closes it",
    async (locale, sendingLabel) => {
      const { copy, dialog, onBack, open, user } = setup({
        locale,
        sending: true,
      });

      await open();

      const confirm = screen.getByTestId("store-checkout-confirm-submit");
      const back = within(dialog()).getByRole("button", { name: copy.back });
      expect(confirm).toHaveTextContent(sendingLabel);
      expect(confirm).toHaveAttribute("aria-disabled", "true");
      expect(back).toHaveAttribute("aria-disabled", "true");
      await user.click(back);
      await user.keyboard("{Escape}");
      expect(onBack).not.toHaveBeenCalled();
      expect(dialog()).toBeVisible();
    }
  );

  test("is drawn in the storefront's palette: a white body under a moss bar with its title in lime", async () => {
    const { dialog, open } = setup();

    await open();

    expect(dialog()).toHaveClass(
      "bg-store-background",
      "text-store-foreground"
    );
    const title = screen.getByRole("heading", { name: "Confirm your order?" });
    expect(title).toHaveClass("text-store-accent", "font-display", "uppercase");
    expect(title.parentElement).toHaveClass("bg-store-contrast");
    expect(screen.getByTestId("dialog-overlay")).toHaveClass(
      "bg-store-foreground/50"
    );
  });
});
