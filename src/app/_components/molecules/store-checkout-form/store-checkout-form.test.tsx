import { QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import type { ReactNode } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { reportError } from "@/lib/errors/client";
import type { Locale } from "@/lib/i18n/config";
import { collectHydrationErrors } from "@/test/hydration";
import { createI18nWrapper, DICTIONARIES, renderWithI18n } from "@/test/i18n";
import { server } from "@/test/msw";
import { createQueryWrapper } from "@/test/setup-helpers";

import {
  StoreCheckoutForm,
  type StoreCheckoutFormProps,
} from "./store-checkout-form";

vi.mock("@/lib/orpc/client", async () => {
  const { orpcClientMock } = await import("@/test/mocks/orpc-client");
  return orpcClientMock;
});

vi.mock("@/lib/errors/client", () => ({ reportError: vi.fn() }));

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const TOKEN = "b".repeat(43);

type Items = { productId: number; quantity: number }[];

function makeItems(overrides: Items = []): Items {
  return overrides.length > 0
    ? overrides
    : [
        { productId: 4, quantity: 2 },
        { productId: 9, quantity: 1 },
      ];
}

/** How `order.create` answers, one per submit, in turn. */
type Answer =
  | "hang"
  | "network"
  | "ok"
  | { code: string; data?: unknown; message: string; status: number };

const SERVER_FAILURE = {
  code: "INTERNAL_SERVER_ERROR",
  message: "Internal server error",
  status: 500,
} as const;

type Total = StoreCheckoutFormProps["total"];

interface SetupOptions {
  answers?: Answer[];
  blockedReason?: string | null;
  items?: Items;
  locale?: Locale;
  /** What the first `onPlaced` throws, as a page that fails to move on. */
  placedFailure?: Error;
  total?: Total;
}

function setup({
  answers = ["ok"],
  blockedReason = null,
  items = makeItems(),
  locale = "en",
  placedFailure,
  total = { amount: 330_000, currency: "UYU" },
}: SetupOptions = {}) {
  // Every body the server received, in order: the spy on what was sent.
  const received: unknown[] = [];
  server.use(
    http.post<never, { json?: unknown }>(
      "*/api/orpc/order/create",
      async ({ request }) => {
        const { json } = await request.json();
        const answer = answers[received.length] ?? "ok";
        received.push(json);

        if (answer === "hang") {
          return await new Promise<never>(() => {});
        }

        if (answer === "network") {
          return HttpResponse.error();
        }

        if (answer === "ok") {
          return HttpResponse.json({ json: { token: TOKEN }, meta: [] });
        }

        return HttpResponse.json(
          { defined: true, ...answer },
          { status: answer.status }
        );
      }
    )
  );
  const copy = DICTIONARIES[locale].storefront.cart.checkout;
  const onPlaced = vi.fn((_token: string, _ordered: Items) => undefined);
  if (placedFailure) {
    onPlaced.mockImplementationOnce(() => {
      throw placedFailure;
    });
  }
  const onStale = vi.fn(() => undefined);
  const wrapper = createQueryWrapper();
  const user = userEvent.setup();
  const form = (
    current: Items,
    blocked: string | null = blockedReason,
    currentTotal: Total = total
  ) => (
    <StoreCheckoutForm
      blockedReason={blocked}
      className="custom"
      items={current}
      onPlaced={onPlaced}
      onStale={onStale}
      total={currentTotal}
    />
  );
  const { rerender } = renderWithI18n(form(items), { locale, wrapper });

  const submit = () => screen.getByTestId("store-checkout-submit");
  /** The confirmation, open: a dialog named by its title. */
  const dialog = () =>
    screen.getByRole("dialog", {
      name: DICTIONARIES[locale].storefront.cart.confirm.title,
    });
  const confirmButton = () =>
    screen.getByTestId("store-checkout-confirm-submit");

  return {
    fill: async ({
      name = "Ana Pérez",
      note = "",
      phone = "099 123 456",
    }: { name?: string; note?: string; phone?: string } = {}) => {
      const field = (label: string) =>
        screen.getByRole("textbox", { name: label });

      await user.clear(field(copy.name));
      if (name) {
        await user.type(field(copy.name), name);
      }
      await user.clear(field(copy.phone));
      if (phone) {
        await user.type(field(copy.phone), phone);
      }
      if (note) {
        await user.type(field(copy.note), note);
      }
    },
    onPlaced,
    onStale,
    received,
    /** The keys the server received, in order. */
    requestKeys: () =>
      received.map((body) =>
        typeof body === "object" && body !== null && "requestKey" in body
          ? body.requestKey
          : null
      ),
    /** Submits the form: valid, it opens the confirmation, nothing more. */
    ask: async () => {
      await user.click(submit());
    },
    /** "Confirmar pedido" in the open confirmation. */
    confirm: async () => {
      await user.click(confirmButton());
    },
    confirmButton,
    dialog,
    /** The confirmation, or `null` when none is open. */
    queryDialog: () => screen.queryByTestId("store-checkout-confirm"),
    rerender: (next: Items, blocked?: string | null, nextTotal?: Total) => {
      rerender(form(next, blocked, nextTotal));
    },
    /** Submits and confirms: the whole way to an order. */
    send: async () => {
      await user.click(submit());
      await user.click(
        await screen.findByTestId("store-checkout-confirm-submit")
      );
    },
    submit,
    user,
  };
}

const alert = () => screen.getByTestId("store-checkout-error");

// The request key lives in the tab's session: each test starts a new tab.
afterEach(() => {
  window.sessionStorage.clear();
  vi.restoreAllMocks();
});

describe("StoreCheckoutForm", () => {
  test("asks for a name, a mobile and an optional note, in English", () => {
    setup();

    expect(
      screen.getByRole("heading", { level: 2, name: "Your details" })
    ).toBeVisible();
    expect(screen.getByRole("textbox", { name: "Your name" })).toHaveAttribute(
      "autocomplete",
      "name"
    );
    expect(
      screen.getByRole("textbox", { name: "Your mobile" })
    ).toHaveAccessibleDescription(
      "The store writes to you on WhatsApp to arrange delivery."
    );
    expect(
      screen.getByRole("textbox", { name: "Note for the store (optional)" })
    ).toHaveAttribute("placeholder", "For example, what time suits you.");
    expect(
      screen.getByRole("button", { name: "Place the order" })
    ).toBeEnabled();
  });

  test("is the cart's one action: a primary pill as wide as the form, its title in the display face", () => {
    setup();

    const submit = screen.getByRole("button", { name: "Place the order" });
    expect(submit).toHaveAttribute("data-slot", "store-button");
    expect(submit).toHaveAttribute("data-variant", "primary");
    expect(submit).toHaveAttribute("data-size", "lg");
    expect(submit).toHaveClass("w-full");
    expect(
      screen.getByRole("heading", { level: 2, name: "Your details" })
    ).toHaveClass("font-display", "font-extrabold", "uppercase");
    // Fields stay square, and large enough that a phone does not zoom in.
    expect(screen.getByRole("textbox", { name: "Your name" })).toHaveClass(
      "text-base",
      "border-2"
    );
    expect(screen.getByRole("textbox", { name: "Your name" })).not.toHaveClass(
      "rounded-full"
    );
  });

  test("speaks Spanish on a Spanish page", async () => {
    const { ask } = setup({ locale: "es" });

    expect(screen.getByRole("textbox", { name: "Tu nombre" })).toBeVisible();
    expect(screen.getByRole("textbox", { name: "Tu celular" })).toBeVisible();
    await ask();

    expect(await screen.findByText("Escribí tu nombre.")).toBeVisible();
    expect(
      screen.getByText("Escribí un celular, por ejemplo 099 123 456.")
    ).toBeVisible();
  });

  test("says what is missing, opens no confirmation and sends nothing", async () => {
    const { ask, fill, queryDialog, received } = setup();

    await fill({ name: "   ", phone: "24001234" });
    await ask();

    expect(await screen.findByText("Write your name.")).toBeVisible();
    expect(
      screen.getByText("Write a mobile number, for example +598 99 123 456.")
    ).toBeVisible();
    expect(screen.getByRole("textbox", { name: "Your name" })).toHaveAttribute(
      "aria-invalid",
      "true"
    );
    // Each error is announced as it appears.
    expect(screen.getByText("Write your name.")).toHaveAttribute(
      "role",
      "alert"
    );
    expect(queryDialog()).toBeNull();
    expect(received).toEqual([]);
  });

  test.each(["099 123 456", "+598 99 123 456"])(
    "takes the mobile %j and sends the order as the cart holds it",
    async (phone) => {
      const { fill, onPlaced, received, requestKeys, send } = setup();

      await fill({ note: "Sin bolsa", phone });
      await send();

      await waitFor(() => {
        expect(onPlaced.mock.calls).toEqual([[TOKEN, makeItems()]]);
      });
      const [requestKey] = requestKeys();
      expect(requestKey).toMatch(UUID_V4);
      expect(received).toEqual([
        {
          customerName: "Ana Pérez",
          customerPhone: phone,
          items: makeItems(),
          locale: "en",
          note: "Sin bolsa",
          requestKey,
        },
      ]);
      expect(screen.queryByTestId("store-checkout-error")).toBeNull();
    }
  );

  test("sends the page's language", async () => {
    const { fill, received, send } = setup({ locale: "es" });

    await fill({ name: "Ana" });
    await send();

    await waitFor(() => {
      expect(received).toEqual([
        expect.objectContaining({ locale: "es", note: "" }),
      ]);
    });
  });

  test("the same cart and phone sent again after a failure carry the same key", async () => {
    const { fill, onPlaced, requestKeys, send } = setup({
      answers: ["network", "ok"],
    });

    await fill();
    await send();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "We could not send the order. Try again."
    );
    // Another name is the same order: only the cart and the phone count.
    await fill({ name: "Ana P." });
    await send();

    await waitFor(() => {
      expect(onPlaced.mock.calls).toEqual([[TOKEN, makeItems()]]);
    });
    const [first, second] = requestKeys();
    expect(first).toMatch(UUID_V4);
    expect(second).toBe(first);
  });

  test("the same cart and phone sent again after a reload carry the same key", async () => {
    const before = setup({ answers: ["network"] });
    await before.fill();
    await before.send();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "We could not send the order. Try again."
    );
    const [first] = before.requestKeys();
    // A reload: the page and its state are gone, the tab's session is not.
    cleanup();
    const after = setup({ answers: ["ok"] });

    await after.fill();
    await after.send();

    await waitFor(() => {
      expect(after.onPlaced.mock.calls).toEqual([[TOKEN, makeItems()]]);
    });
    expect(after.requestKeys()).toEqual([first]);
  });

  test("a placed order forgets its key: the next checkout is a new request", async () => {
    const before = setup({ answers: ["ok"] });
    await before.fill();
    await before.send();
    await waitFor(() => {
      expect(before.onPlaced.mock.calls).toEqual([[TOKEN, makeItems()]]);
    });
    const [first] = before.requestKeys();
    // The same cart and phone again, in a later visit of the same tab.
    cleanup();
    const after = setup({ answers: ["ok"] });

    await after.fill();
    await after.send();

    await waitFor(() => {
      expect(after.onPlaced.mock.calls).toEqual([[TOKEN, makeItems()]]);
    });
    const [second] = after.requestKeys();
    expect(second).toMatch(UUID_V4);
    expect(second).not.toBe(first);
  });

  test("a page that fails to move on after the order is taken is not a failed order, and keeps the key", async () => {
    const failure = new Error("Navigation failed");
    const { fill, onPlaced, requestKeys, send, submit } = setup({
      answers: ["ok", "ok"],
      placedFailure: failure,
    });

    await fill();
    await send();

    await waitFor(() => {
      expect(reportError).toHaveBeenCalledExactlyOnceWith(failure, {
        action: "Checkout.show_order",
      });
    });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(submit()).toHaveAttribute("aria-disabled", "false");
    // The button again: the same key, so the server answers the same order.
    await send();

    await waitFor(() => {
      expect(onPlaced.mock.calls).toEqual([
        [TOKEN, makeItems()],
        [TOKEN, makeItems()],
      ]);
    });
    const [first, second] = requestKeys();
    expect(first).toMatch(UUID_V4);
    expect(second).toBe(first);
    expect(window.sessionStorage.getItem("feria:checkout")).toBeNull();
  });

  test("a key that cannot be drawn is a failure that frees the button, sending nothing", async () => {
    const failure = new Error("No random source");
    const { fill, onPlaced, received, send } = setup();
    vi.spyOn(crypto, "randomUUID").mockImplementationOnce(() => {
      throw failure;
    });

    await fill();
    await send();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "We could not send the order. Try again."
    );
    expect(reportError).toHaveBeenCalledExactlyOnceWith(failure, {
      action: "Checkout.place_order",
    });
    expect(received).toEqual([]);
    await send();

    await waitFor(() => {
      expect(onPlaced.mock.calls).toEqual([[TOKEN, makeItems()]]);
    });
    expect(received).toEqual([expect.objectContaining({ items: makeItems() })]);
  });

  test("the same number typed another way after a failure carries the same key", async () => {
    const { fill, received, requestKeys, send } = setup({
      answers: [SERVER_FAILURE, "ok"],
    });

    await fill({ phone: "099 123 456" });
    await send();
    await screen.findByRole("alert");
    await fill({ phone: "+598 99 123 456" });
    await send();

    await waitFor(() => {
      expect(received).toEqual([
        expect.objectContaining({ customerPhone: "099 123 456" }),
        expect.objectContaining({ customerPhone: "+598 99 123 456" }),
      ]);
    });
    const [first, second] = requestKeys();
    expect(first).toMatch(UUID_V4);
    expect(second).toBe(first);
  });

  test("the cart's items as sent reach onPlaced with the token", async () => {
    const items = makeItems([{ productId: 12, quantity: 5 }]);
    const { fill, onPlaced, send } = setup({ items });

    await fill();
    await send();

    await waitFor(() => {
      expect(onPlaced.mock.calls).toEqual([
        [TOKEN, [{ productId: 12, quantity: 5 }]],
      ]);
    });
  });

  test("another phone after a failure is a new request", async () => {
    const { fill, requestKeys, send } = setup({
      answers: [SERVER_FAILURE, "ok"],
    });

    await fill();
    await send();
    await screen.findByRole("alert");
    await fill({ phone: "099 765 432" });
    await send();

    await waitFor(() => {
      expect(requestKeys()).toEqual([
        expect.stringMatching(UUID_V4),
        expect.stringMatching(UUID_V4),
      ]);
    });
    const [first, second] = requestKeys();
    expect(second).toMatch(UUID_V4);
    expect(second).not.toBe(first);
  });

  test("another cart after a failure is a new request", async () => {
    const { fill, received, requestKeys, rerender, send } = setup({
      answers: [SERVER_FAILURE, "ok"],
    });

    await fill();
    await send();
    await screen.findByRole("alert");
    rerender(makeItems([{ productId: 4, quantity: 3 }]));
    await send();

    await waitFor(() => {
      expect(received).toEqual([
        expect.objectContaining({ items: makeItems() }),
        expect.objectContaining({
          items: [{ productId: 4, quantity: 3 }],
        }),
      ]);
    });
    const [first, second] = requestKeys();
    expect(second).toMatch(UUID_V4);
    expect(second).not.toBe(first);
  });

  test("holds the confirmation while the order is sent, saying so, keeping its focus, and nothing closes it", async () => {
    const { confirmButton, dialog, fill, received, send, submit, user } = setup(
      { answers: ["hang"] }
    );

    expect(submit()).toHaveAttribute("aria-disabled", "false");
    await fill();
    await send();

    await waitFor(() => {
      expect(confirmButton()).toHaveTextContent("Sending the order…");
    });
    expect(confirmButton()).toHaveAttribute("aria-disabled", "true");
    expect(confirmButton()).toBeEnabled();
    expect(confirmButton()).toHaveFocus();
    // The order is on its way: it cannot be taken back.
    expect(
      within(dialog()).getByRole("button", { name: "Go back" })
    ).toHaveAttribute("aria-disabled", "true");
    await user.click(confirmButton());
    await user.click(within(dialog()).getByRole("button", { name: "Go back" }));
    await user.keyboard("{Escape}");
    expect(dialog()).toBeVisible();
    expect(received).toEqual([
      expect.objectContaining({ customerPhone: "099 123 456" }),
    ]);
  });

  test("two taps at once on Confirm order send one order", async () => {
    const { ask, confirmButton, fill, onPlaced, received } = setup({
      answers: ["ok", "ok"],
    });

    await fill();
    await ask();
    // Both land before React renders "sending".
    fireEvent.click(confirmButton());
    fireEvent.click(confirmButton());

    await waitFor(() => {
      expect(onPlaced.mock.calls).toEqual([[TOKEN, makeItems()]]);
    });
    expect(received).toEqual([expect.objectContaining({ items: makeItems() })]);
  });

  test.each([
    [
      "en",
      "Confirm your order?",
      ["Units", "3"],
      ["Total", "UYU\u00A03,300"],
      "Name",
      "Mobile",
      "Confirm order",
      "Go back",
    ],
    [
      "es",
      "¿Confirmás el pedido?",
      ["Unidades", "3"],
      ["Total", "$\u00A03.300"],
      "Nombre",
      "Celular",
      "Confirmar pedido",
      "Volver",
    ],
  ] as const)(
    "in %s, a valid submit sends nothing yet: it asks %j, summing up the units, the total, the name and the mobile typed",
    async (locale, title, units, total, name, phone, confirm, back) => {
      const { ask, dialog, fill, received } = setup({ locale });

      await fill({ name: "Ana Pérez", phone: "099 123 456" });
      await ask();

      expect(dialog()).toHaveAccessibleName(title);
      expect(dialog()).toHaveAccessibleDescription(
        DICTIONARIES[locale].storefront.cart.confirm.description
      );
      const rows = within(screen.getByTestId("store-checkout-confirm-summary"))
        .getAllByRole("term")
        .map((term) => [
          term.textContent,
          term.nextElementSibling?.textContent,
        ]);
      expect(rows).toEqual([
        units,
        total,
        [name, "Ana Pérez"],
        [phone, "099 123 456"],
      ]);
      expect(
        within(dialog())
          .getAllByRole("button")
          .map((button) => button.textContent)
      ).toEqual([confirm, back]);
      expect(received).toEqual([]);
    }
  );

  test("the summary counts every unit of every line, and leaves the total out before the prices", async () => {
    const { ask, fill } = setup({
      items: makeItems([
        { productId: 4, quantity: 2 },
        { productId: 9, quantity: 5 },
      ]),
      total: null,
    });

    await fill();
    await ask();

    expect(
      screen.getByTestId("store-checkout-confirm-units")
    ).toHaveTextContent(/^Units7$/u);
    expect(screen.queryByTestId("store-checkout-confirm-total")).toBeNull();
  });

  test("before confirming, the summary follows the cart; once sent, it holds what was sent", async () => {
    const { ask, confirm, confirmButton, fill, received, rerender } = setup({
      answers: ["hang"],
    });
    const units = () => screen.getByTestId("store-checkout-confirm-units");
    const totalRow = () => screen.getByTestId("store-checkout-confirm-total");

    await fill();
    await ask();
    // Another tab adds a unit while the dialog asks: that is what is sent.
    rerender(
      makeItems([
        { productId: 4, quantity: 3 },
        { productId: 9, quantity: 1 },
      ]),
      null,
      { amount: 450_000, currency: "UYU" }
    );
    expect(units()).toHaveTextContent(/^Units4$/u);
    expect(totalRow()).toHaveTextContent(/^TotalUYU 4,500$/u);

    await confirm();
    await waitFor(() => {
      expect(confirmButton()).toHaveTextContent("Sending the order…");
    });
    // On its way, the cart changes again: the summary is still the order.
    rerender(makeItems([{ productId: 4, quantity: 9 }]), null, {
      amount: 1_080_000,
      currency: "UYU",
    });

    expect(units()).toHaveTextContent(/^Units4$/u);
    expect(totalRow()).toHaveTextContent(/^TotalUYU 4,500$/u);
    expect(received).toEqual([
      expect.objectContaining({
        items: [
          { productId: 4, quantity: 3 },
          { productId: 9, quantity: 1 },
        ],
      }),
    ]);
  });

  test("starts focus on Go back, the choice that sends nothing", async () => {
    const { ask, fill } = setup();

    await fill();
    await ask();

    expect(screen.getByRole("button", { name: "Go back" })).toHaveFocus();
  });

  test.each([
    ["Go back", "click"],
    ["Escape", "escape"],
  ] as const)(
    "%s closes the confirmation, keeps everything typed, sends nothing and gives focus back to the submit button",
    async (_case, how) => {
      const { ask, dialog, fill, queryDialog, received, submit, user } =
        setup();

      await fill({
        name: "Ana Pérez",
        note: "Sin bolsa",
        phone: "099 123 456",
      });
      await ask();
      await (how === "click"
        ? user.click(within(dialog()).getByRole("button", { name: "Go back" }))
        : user.keyboard("{Escape}"));

      await waitFor(() => {
        expect(queryDialog()).toBeNull();
      });
      expect(submit()).toHaveFocus();
      expect(screen.getByRole("textbox", { name: "Your name" })).toHaveValue(
        "Ana Pérez"
      );
      expect(screen.getByRole("textbox", { name: "Your mobile" })).toHaveValue(
        "099 123 456"
      );
      expect(
        screen.getByRole("textbox", { name: "Note for the store (optional)" })
      ).toHaveValue("Sin bolsa");
      expect(received).toEqual([]);
    }
  );

  test("asked again after going back, it confirms the details typed since", async () => {
    const { ask, confirm, dialog, fill, received, user } = setup();

    await fill({ name: "Ana" });
    await ask();
    await user.click(within(dialog()).getByRole("button", { name: "Go back" }));
    await fill({ name: "Ana Pérez", phone: "099 765 432" });
    await ask();
    expect(screen.getByTestId("store-checkout-confirm-name")).toHaveTextContent(
      /^NameAna Pérez$/u
    );
    await confirm();

    await waitFor(() => {
      expect(received).toEqual([
        expect.objectContaining({
          customerName: "Ana Pérez",
          customerPhone: "099 765 432",
        }),
      ]);
    });
  });

  test("a cart held while the confirmation is open closes it and sends nothing", async () => {
    const { ask, confirm, fill, queryDialog, received, rerender, submit } =
      setup();

    await fill();
    await ask();
    rerender(makeItems(), "Bringing today's prices…");
    await confirm();

    await waitFor(() => {
      expect(queryDialog()).toBeNull();
    });
    expect(submit()).toHaveAccessibleDescription("Bringing today's prices…");
    expect(received).toEqual([]);
  });

  test.each([
    ["en", "customerName", "The name can be up to 80 characters.", 81],
    ["es", "customerName", "El nombre puede tener hasta 80 letras.", 81],
    ["en", "note", "The note can be up to 500 characters.", 501],
    ["es", "note", "La nota puede tener hasta 500 letras.", 501],
  ] as const)(
    "in %s, a %s past its length says %j and sends nothing",
    async (locale, field, message, length) => {
      const { ask, fill, queryDialog, received } = setup({ locale });
      const copy = DICTIONARIES[locale].storefront.cart.checkout;

      await fill();
      // The field's maxLength stops typing; a pasted or scripted value
      // still reaches the form.
      fireEvent.change(
        screen.getByRole("textbox", {
          name: field === "note" ? copy.note : copy.name,
        }),
        { target: { value: "x".repeat(length) } }
      );
      await ask();

      expect(await screen.findByText(message)).toBeVisible();
      expect(queryDialog()).toBeNull();
      expect(received).toEqual([]);
    }
  );

  test("a blocked cart holds the button and says why", async () => {
    const { fill, received, submit, user } = setup({
      blockedReason: "Take out what is sold out.",
    });

    expect(screen.getByText("Take out what is sold out.")).toBeVisible();
    expect(submit()).toBeDisabled();
    expect(submit()).toHaveAccessibleDescription("Take out what is sold out.");
    await fill();
    await user.click(submit());
    expect(received).toEqual([]);
  });

  test("an open cart's button has no description", () => {
    const { submit } = setup();

    expect(submit()).not.toHaveAttribute("aria-describedby");
  });

  test.each([
    [
      "too many orders",
      {
        code: "TOO_MANY_REQUESTS",
        data: { retryAfter: 61 },
        message: "Too many orders",
        status: 429,
      },
      "You placed several orders in a short time. Try again in 2 min.",
      false,
    ],
    [
      "a sold-out article",
      {
        code: "BAD_REQUEST",
        message: "Article not available",
        status: 400,
      },
      "Something in your cart changed while you were looking. Check it and send again.",
      true,
    ],
    [
      "a refusal",
      { code: "FORBIDDEN", message: "Forbidden", status: 403 },
      "We could not accept this order. If it keeps happening, write to the store.",
      false,
    ],
  ] as const)(
    "says %s in its words, without reporting it",
    async (_case, answer, message, stale) => {
      const { fill, onPlaced, onStale, send, submit } = setup({
        answers: [answer],
      });

      await fill();
      await send();

      expect(await screen.findByRole("alert")).toHaveTextContent(message);
      expect(alert()).toHaveTextContent(new RegExp(`^${message}$`, "u"));
      expect(onStale.mock.calls).toEqual(stale ? [[]] : []);
      expect(onPlaced).not.toHaveBeenCalled();
      expect(reportError).not.toHaveBeenCalled();
      // The shopper can send again.
      expect(submit()).toBeEnabled();
    }
  );

  test("reports a server failure and says it could not send", async () => {
    const { fill, onStale, send } = setup({ answers: [SERVER_FAILURE] });

    await fill();
    await send();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "We could not send the order. Try again."
    );
    expect(reportError).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        code: "INTERNAL_SERVER_ERROR",
        message: "Internal server error",
      }),
      { action: "Checkout.place_order" }
    );
    expect(onStale).not.toHaveBeenCalled();
  });

  test("reports a network failure and says it could not send", async () => {
    const { fill, send } = setup({ answers: ["network"] });

    await fill();
    await send();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "We could not send the order. Try again."
    );
    expect(reportError).toHaveBeenCalledExactlyOnceWith(expect.any(TypeError), {
      action: "Checkout.place_order",
    });
  });

  test("after a failure closes the confirmation and gives the button its focus, and the next submit is sent and clears it", async () => {
    const { fill, onPlaced, queryDialog, received, send, submit } = setup({
      answers: ["network", "ok"],
    });

    await fill();
    await send();
    await screen.findByRole("alert");
    expect(queryDialog()).toBeNull();
    expect(submit()).toHaveFocus();
    expect(submit()).toHaveAttribute("aria-disabled", "false");
    await send();

    await waitFor(() => {
      expect(onPlaced.mock.calls).toEqual([[TOKEN, makeItems()]]);
    });
    expect(received).toEqual([
      expect.objectContaining({ items: makeItems() }),
      expect.objectContaining({ items: makeItems() }),
    ]);
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("StoreCheckoutForm before hydration", () => {
  test("its button is disabled in the server's HTML and enabled once React owns it", () => {
    const I18n = createI18nWrapper("en");
    const { queryClient } = createQueryWrapper();

    function Providers({ children }: { children: ReactNode }) {
      return (
        <QueryClientProvider client={queryClient}>
          <I18n>{children}</I18n>
        </QueryClientProvider>
      );
    }

    const { clientHtml, errors, serverHtml } = collectHydrationErrors(
      <Providers>
        <StoreCheckoutForm
          blockedReason={null}
          items={makeItems()}
          onPlaced={() => undefined}
          onStale={() => undefined}
          total={null}
        />
      </Providers>,
      { clientNowMs: 1000, serverNowMs: 0 }
    );
    const buttonIn = (html: string) => {
      const container = document.createElement("div");
      container.innerHTML = html;
      return container.querySelector("button[type=submit]");
    };

    expect(buttonIn(serverHtml)).toHaveProperty("disabled", true);
    expect(buttonIn(clientHtml)).toHaveProperty("disabled", false);
    expect(errors).toEqual([]);
  });
});
