import { QueryClientProvider } from "@tanstack/react-query";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import type { ReactNode } from "react";
import { describe, expect, test, vi } from "vitest";

import { reportError } from "@/lib/errors/client";
import type { Locale } from "@/lib/i18n/config";
import { collectHydrationErrors } from "@/test/hydration";
import { createI18nWrapper, DICTIONARIES, renderWithI18n } from "@/test/i18n";
import { server } from "@/test/msw";
import { createQueryWrapper } from "@/test/setup-helpers";

import { StoreCheckoutForm } from "./store-checkout-form";

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

interface SetupOptions {
  answers?: Answer[];
  blockedReason?: string | null;
  items?: Items;
  locale?: Locale;
}

function setup({
  answers = ["ok"],
  blockedReason = null,
  items = makeItems(),
  locale = "en",
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
  const onPlaced = vi.fn((_token: string) => undefined);
  const onStale = vi.fn(() => undefined);
  const wrapper = createQueryWrapper();
  const user = userEvent.setup();
  const form = (current: Items) => (
    <StoreCheckoutForm
      blockedReason={blockedReason}
      className="custom"
      items={current}
      onPlaced={onPlaced}
      onStale={onStale}
      storeSlug="lr-market"
    />
  );
  const { rerender } = renderWithI18n(form(items), { locale, wrapper });

  const submit = () => screen.getByTestId("store-checkout-submit");

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
    rerender: (next: Items) => {
      rerender(form(next));
    },
    send: async () => {
      await user.click(submit());
    },
    submit,
    user,
  };
}

const alert = () => screen.getByTestId("store-checkout-error");

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
    expect(screen.getByRole("button", { name: "Place order" })).toBeEnabled();
  });

  test("speaks Spanish on a Spanish page", async () => {
    const { send } = setup({ locale: "es" });

    expect(screen.getByRole("textbox", { name: "Tu nombre" })).toBeVisible();
    expect(screen.getByRole("textbox", { name: "Tu celular" })).toBeVisible();
    await send();

    expect(await screen.findByText("Escribí tu nombre.")).toBeVisible();
    expect(
      screen.getByText("Escribí un celular, por ejemplo 099 123 456.")
    ).toBeVisible();
  });

  test("says what is missing and sends nothing", async () => {
    const { fill, received, send } = setup();

    await fill({ name: "   ", phone: "24001234" });
    await send();

    expect(await screen.findByText("Write your name.")).toBeVisible();
    expect(
      screen.getByText("Write a mobile number, for example +598 99 123 456.")
    ).toBeVisible();
    expect(screen.getByRole("textbox", { name: "Your name" })).toHaveAttribute(
      "aria-invalid",
      "true"
    );
    expect(received).toEqual([]);
  });

  test.each(["099 123 456", "+598 99 123 456"])(
    "takes the mobile %j and sends the order as the cart holds it",
    async (phone) => {
      const { fill, onPlaced, received, requestKeys, send } = setup();

      await fill({ note: "Sin bolsa", phone });
      await send();

      await waitFor(() => {
        expect(onPlaced.mock.calls).toEqual([[TOKEN]]);
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
          storeSlug: "lr-market",
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
      expect(onPlaced.mock.calls).toEqual([[TOKEN]]);
    });
    const [first, second] = requestKeys();
    expect(first).toMatch(UUID_V4);
    expect(second).toBe(first);
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

  test("holds the button while the order is sent, saying so", async () => {
    const { fill, requestKeys, send, submit, user } = setup({
      answers: ["hang"],
    });

    await fill();
    await send();

    await waitFor(() => {
      expect(submit()).toHaveTextContent("Sending the order…");
    });
    expect(submit()).toBeDisabled();
    await user.click(submit());
    expect(requestKeys()).toEqual([expect.stringMatching(UUID_V4)]);
  });

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

  test("clears the failure once the next submit is sent", async () => {
    const { fill, onPlaced, send } = setup({ answers: ["network", "ok"] });

    await fill();
    await send();
    await screen.findByRole("alert");
    await send();

    await waitFor(() => {
      expect(onPlaced.mock.calls).toEqual([[TOKEN]]);
    });
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
          storeSlug="lr-market"
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
