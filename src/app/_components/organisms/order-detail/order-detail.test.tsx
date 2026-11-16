import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http, type RequestHandler } from "msw";
import type { ReactNode } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";

import {
  forgetOrderArrivals,
  freshArrivals,
  recordOrderList,
} from "@/lib/admin/order-arrivals";
import type { OrdersQuery } from "@/lib/admin/orders";
import { reportError } from "@/lib/errors/client";
import type { Locale } from "@/lib/i18n/config";
import type { OrderStatus } from "@/lib/schemas/order";
import { renderWithI18n } from "@/test/i18n";
import { createOrpcHandler, server } from "@/test/msw";

import { OrderDetail } from "./order-detail";

vi.mock("@/lib/orpc/client", async () => {
  const { orpcClientMock } = await import("@/test/mocks/orpc-client");
  return orpcClientMock;
});

vi.mock("@/lib/errors/client", () => ({ reportError: vi.fn() }));

afterEach(() => {
  forgetOrderArrivals();
});

const RENDERED_AT = Date.parse("2026-11-14T22:00:00.000Z");
const HOUR = 3_600_000;

interface HistoryEvent {
  changedByName: string | null;
  createdAt: string;
  status: OrderStatus;
}

function makeOrder(
  overrides: Partial<{
    history: HistoryEvent[];
    locale: Locale;
    note: string | null;
    phoneVerified: boolean;
    status: OrderStatus;
  }> = {}
) {
  const history: HistoryEvent[] = [
    {
      changedByName: null,
      createdAt: new Date(RENDERED_AT - 2 * HOUR).toISOString(),
      status: "received",
    },
    {
      changedByName: "Ada Admin",
      createdAt: new Date(RENDERED_AT - HOUR).toISOString(),
      status: "packed",
    },
  ];

  return {
    code: "K7P2Q",
    createdAt: new Date(RENDERED_AT - 2 * HOUR).toISOString(),
    currencyCode: "UYU",
    customerName: "Ana Pérez",
    customerPhone: "+59899123456",
    history,
    id: 42,
    items: [
      { productId: 7, quantity: 2, title: "Collar", unitPriceAmount: 64_500 },
      { productId: 9, quantity: 1, title: "Aros", unitPriceAmount: 30_050 },
    ],
    locale: "es",
    note: "Lo paso a buscar a las 18",
    phoneVerified: true,
    status: "packed",
    totalAmount: 159_050,
    ...overrides,
  };
}

type Order = ReturnType<typeof makeOrder>;

/** What a call answers: a value, an oRPC error, or nothing at all. */
type Answer<T> = T | "conflict" | "fail" | "hang";

const ERRORS = {
  conflict: {
    code: "CONFLICT",
    message: "That status change is not allowed",
    status: 409,
  },
  fail: {
    code: "INTERNAL_SERVER_ERROR",
    message: "Internal server error",
    status: 500,
  },
};

function errorFor(answered: unknown) {
  if (answered === "conflict") {
    return ERRORS.conflict;
  }

  return answered === "fail" ? ERRORS.fail : null;
}

function answering<T>(
  path: string,
  answer: (input: unknown) => Answer<T>
): RequestHandler {
  return http.post<never, { json?: unknown }>(
    `*/api/orpc/${path}`,
    async ({ request }) => {
      const body = await request.json();
      const answered = answer(body.json);

      if (answered === "hang") {
        return await new Promise<never>(() => {});
      }

      const error = errorFor(answered);

      if (error) {
        return HttpResponse.json(
          { defined: true, ...error },
          { status: error.status }
        );
      }

      return HttpResponse.json({ json: answered, meta: [] });
    }
  );
}

function setup({
  change = { id: 42, status: "delivered" },
  from = {},
  gets = [makeOrder()],
  locale = "en",
}: {
  change?: Answer<{ id: number; status: OrderStatus }>;
  /** The list's selection the order was opened from. */
  from?: OrdersQuery;
  /** `order.get`'s answers, in turn; the last one repeats. */
  gets?: Answer<Order>[];
  locale?: Locale;
} = {}) {
  vi.setSystemTime(RENDERED_AT);
  let answered = 0;
  const get = vi.fn((_input: unknown) => {
    const answer = gets[Math.min(answered, gets.length - 1)] ?? "fail";
    answered += 1;
    return answer;
  });
  const changeStatus = vi.fn((_input: unknown) => change);
  server.use(
    answering("order/get", get),
    answering("order/changeStatus", changeStatus),
    // The lists and counts it invalidates are not on this screen.
    createOrpcHandler("order.list", () => ({ items: [], nextCursor: null }))
  );
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });

  function Providers({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  }

  const user = userEvent.setup();
  renderWithI18n(
    <OrderDetail
      from={from}
      id={42}
      renderedAt={RENDERED_AT}
      storeSlug="lr-market"
    />,
    { locale, wrapper: Providers }
  );

  return {
    changeStatus,
    get,
    section: (name: string) => {
      const heading = screen.getByRole("heading", { level: 2, name });
      const section = heading.parentElement;

      if (!section) {
        throw new Error(`No section for ${name}`);
      }

      return section;
    },
    user,
  };
}

describe("OrderDetail", () => {
  test("heads the page with the order's code, status and when it was placed", async () => {
    const { get } = setup();

    expect(
      await screen.findByRole("heading", { level: 1, name: "Order K7P2Q" })
    ).toBeInTheDocument();
    const detail = screen.getByTestId("order-detail");
    expect(detail).toHaveAttribute("data-slot", "order-detail");
    expect(within(detail).getAllByRole("time")[0]).toHaveTextContent(
      /^Placed 2 hours ago · November 14, 2026$/u
    );
    expect(within(detail).getAllByRole("time")[0]).toHaveAttribute(
      "datetime",
      "2026-11-14T20:00:00.000Z"
    );
    expect(
      screen.getByRole("link", { name: "Back to orders" })
    ).toHaveAttribute("href", "/en/admin/lr-market/orders");
    expect(get).toHaveBeenCalledExactlyOnceWith({
      id: 42,
      storeSlug: "lr-market",
    });
  });

  test("lists what was ordered with each line's total, then the order's total", async () => {
    setup();
    await screen.findByTestId("order-detail");

    const [first, second] = within(
      screen.getByTestId("order-items")
    ).getAllByRole("listitem");
    expect(first).toHaveTextContent(/^2 × CollarUYU 1,290$/u);
    expect(second).toHaveTextContent(/^1 × ArosUYU 300\.50$/u);
    expect(screen.getByTestId("order-total")).toHaveTextContent(
      /^TotalUYU 1,590.50$/u
    );
  });

  test("shows the customer's note, and no note section without one", async () => {
    setup();
    await screen.findByTestId("order-detail");

    expect(
      screen.getByRole("heading", { level: 2, name: "Customer's note" })
        .nextElementSibling
    ).toHaveTextContent(/^Lo paso a buscar a las 18$/u);
  });

  test("leaves the note out when the customer wrote none", async () => {
    setup({ gets: [makeOrder({ note: null })] });
    await screen.findByTestId("order-detail");

    expect(
      screen.queryByRole("heading", { name: "Customer's note" })
    ).not.toBeInTheDocument();
  });

  test.each([
    [
      "es",
      true,
      "Phone confirmed: Yes",
      "https://wa.me/59899123456?text=Hola%20Ana%20P%C3%A9rez%2C%20te%20escribo%20por%20tu%20pedido%20K7P2Q.",
    ],
    [
      "en",
      false,
      "Phone confirmed: No",
      "https://wa.me/59899123456?text=Hi%20Ana%20P%C3%A9rez%2C%20I'm%20writing%20about%20your%20order%20K7P2Q.",
    ],
  ] as const)(
    "for a customer who ordered in %s, the contact opens WhatsApp in their language",
    async (orderLocale, phoneVerified, confirmed, href) => {
      const { section } = setup({
        gets: [makeOrder({ locale: orderLocale, phoneVerified })],
      });
      await screen.findByTestId("order-detail");

      const contact = section("Contact");
      expect(contact).toHaveTextContent(confirmed);
      expect(within(contact).getByText("Ana Pérez")).toBeInTheDocument();
      const phone = within(contact).getByRole("link", {
        name: "Phone +59899123456",
      });
      expect(phone).toHaveAttribute("href", "tel:+59899123456");
      // A 44 px target for a thumb.
      expect(phone).toHaveClass("inline-flex", "min-h-11", "items-center");
      const whatsapp = within(contact).getByRole("link", {
        name: "Open WhatsApp chat (opens in a new tab)",
      });
      expect(whatsapp).toHaveAttribute("href", href);
      expect(whatsapp).toHaveAttribute("target", "_blank");
      expect(whatsapp).toHaveAttribute("rel", "noopener noreferrer");
    }
  );

  test("tells who moved the order and when, the placing first", async () => {
    setup();
    await screen.findByTestId("order-detail");

    expect(
      within(screen.getByTestId("order-history"))
        .getAllByRole("listitem")
        .map((item) => item.textContent)
    ).toEqual(["ReceivedOrder placed2 hours ago", "PackedAda Admin1 hour ago"]);
  });

  test("names a move with no login behind it, after the placing, as someone no longer on the team", async () => {
    setup({
      gets: [
        makeOrder({
          history: [
            {
              changedByName: null,
              createdAt: new Date(RENDERED_AT - 3 * HOUR).toISOString(),
              status: "received",
            },
            {
              changedByName: null,
              createdAt: new Date(RENDERED_AT - 2 * HOUR).toISOString(),
              status: "packed",
            },
            {
              changedByName: null,
              createdAt: new Date(RENDERED_AT - HOUR).toISOString(),
              status: "received",
            },
          ],
        }),
      ],
      locale: "es",
    });
    await screen.findByTestId("order-detail");

    expect(
      within(screen.getByTestId("order-history"))
        .getAllByRole("listitem")
        .map((item) => item.textContent)
    ).toEqual([
      "RecibidoPedido hechohace 3 horas",
      "PreparadoAlguien que ya no está en el equipohace 2 horas",
      "RecibidoAlguien que ya no está en el equipohace 1 hora",
    ]);
  });

  test("a first event that is not the placing is no placing", async () => {
    setup({
      gets: [
        makeOrder({
          history: [
            {
              changedByName: null,
              createdAt: new Date(RENDERED_AT - HOUR).toISOString(),
              status: "packed",
            },
          ],
        }),
      ],
    });
    await screen.findByTestId("order-detail");

    expect(
      within(screen.getByTestId("order-history"))
        .getAllByRole("listitem")
        .map((item) => item.textContent)
    ).toEqual(["PackedSomeone no longer on the team1 hour ago"]);
  });

  test("goes back to the tab and search the order was opened from", async () => {
    setup({ from: { q: "ana", status: "received" } });

    expect(
      await screen.findByRole("link", { name: "Back to orders" })
    ).toHaveAttribute(
      "href",
      "/en/admin/lr-market/orders?status=received&q=ana"
    );
  });

  test("opening an order that arrived takes its New mark off the list", async () => {
    recordOrderList("lr-market", {}, [[]], RENDERED_AT);
    recordOrderList(
      "lr-market",
      {},
      [
        [
          {
            code: "K7P2Q",
            createdAt: new Date(RENDERED_AT),
            id: 42,
            status: "received",
          },
          {
            code: "AB3CD",
            createdAt: new Date(RENDERED_AT - 60_000),
            id: 7,
            status: "received",
          },
        ],
      ],
      RENDERED_AT
    );
    expect([...freshArrivals("lr-market").keys()]).toEqual([42, 7]);

    setup();
    await screen.findByTestId("order-detail");

    expect([...freshArrivals("lr-market").keys()]).toEqual([7]);
  });

  test("speaks Spanish", async () => {
    const { section } = setup({ locale: "es" });

    expect(
      await screen.findByRole("heading", { level: 1, name: "Pedido K7P2Q" })
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId("order-history"))
        .getAllByRole("listitem")
        .map((item) => item.textContent)
    ).toEqual([
      "RecibidoPedido hechohace 2 horas",
      "PreparadoAda Adminhace 1 hora",
    ]);
    expect(
      within(section("Contacto")).getByRole("link", {
        name: "Abrir chat de WhatsApp (se abre en otra pestaña)",
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Volver a pedidos" })
    ).toHaveAttribute("href", "/admin/lr-market/orders");
    expect(screen.getByTestId("order-total")).toHaveTextContent(
      /^Total\$ 1\.590,50$/u
    );
  });

  test("moves the order on one tap, then shows where it landed", async () => {
    const { changeStatus, get, user } = setup({
      gets: [makeOrder(), makeOrder({ status: "delivered" })],
    });
    await screen.findByTestId("order-detail");

    await user.click(screen.getByRole("button", { name: "Mark delivered" }));

    expect(changeStatus).toHaveBeenCalledExactlyOnceWith({
      id: 42,
      status: "delivered",
      storeSlug: "lr-market",
    });
    expect(
      await screen.findByRole("button", { name: "Back to packed" })
    ).toBeInTheDocument();
    expect(get).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(reportError).not.toHaveBeenCalled();
  });

  test("says a move is on its way on the button tapped", async () => {
    const { user } = setup({ change: "hang" });
    await screen.findByTestId("order-detail");

    await user.click(screen.getByRole("button", { name: "Mark delivered" }));

    expect(
      await screen.findByRole("button", { name: "Saving…" })
    ).toHaveFocus();
  });

  test("a move someone got to first says the order was updated, and reports nothing", async () => {
    const { get, user } = setup({
      change: "conflict",
      gets: [makeOrder(), makeOrder({ status: "delivered" })],
    });
    await screen.findByTestId("order-detail");

    await user.click(screen.getByRole("button", { name: "Mark delivered" }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      /^Someone already changed this order; we've updated it\.$/u
    );
    expect(
      await screen.findByRole("button", { name: "Back to packed" })
    ).toBeInTheDocument();
    expect(get).toHaveBeenCalledTimes(2);
    expect(reportError).not.toHaveBeenCalled();
  });

  test("a move that fails says so, and is reported", async () => {
    const { user } = setup({ change: "fail" });
    await screen.findByTestId("order-detail");

    await user.click(screen.getByRole("button", { name: "Mark delivered" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /^We couldn't change the status\. Try again\.$/u
    );
    expect(reportError).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ code: "INTERNAL_SERVER_ERROR" }),
      { action: "Orders.change_status" }
    );
  });

  test("a new move clears what the last one said", async () => {
    const { user } = setup({ change: "fail" });
    await screen.findByTestId("order-detail");
    await user.click(screen.getByRole("button", { name: "Mark delivered" }));
    await screen.findByRole("alert");
    server.use(answering("order/changeStatus", () => "hang"));

    await user.click(screen.getByRole("button", { name: "Back to received" }));

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  test("waits behind a skeleton, with the way back", () => {
    setup({ gets: ["hang"] });

    expect(screen.getByTestId("order-detail-skeleton")).toHaveAttribute(
      "aria-busy",
      "true"
    );
    expect(
      screen.getByRole("link", { name: "Back to orders" })
    ).toBeInTheDocument();
  });

  test("an order that fails to load says so and reads again on retry", async () => {
    const { get, user } = setup({ gets: ["fail", makeOrder()] });

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("We couldn't load the order.");
    expect(
      screen.getByRole("link", { name: "Back to orders" })
    ).toBeInTheDocument();

    await user.click(within(alert).getByRole("button", { name: "Try again" }));

    expect(
      await screen.findByRole("heading", { level: 1, name: "Order K7P2Q" })
    ).toBeInTheDocument();
    expect(get).toHaveBeenCalledTimes(2);
  });
});
