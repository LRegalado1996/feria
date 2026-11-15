import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http, type RequestHandler } from "msw";
import type { ReactNode } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";

import type { OrdersQuery } from "@/lib/admin/orders";
import { ORDER_SOUND_STORAGE_KEY } from "@/lib/hooks/order/use-order-sound";
import type { Locale } from "@/lib/i18n/config";
import { renderWithI18n } from "@/test/i18n";
import { createOrpcErrorHandler, createOrpcHandler, server } from "@/test/msw";

import { OrderManager } from "./order-manager";

vi.mock("@/lib/orpc/client", async () => {
  const { orpcClientMock } = await import("@/test/mocks/orpc-client");
  return orpcClientMock;
});

vi.mock("@/lib/errors/client", () => ({ reportError: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }) }));

afterEach(() => {
  window.localStorage.clear();
});

/** The instant the server rendered the screen, and the frozen clock. */
const RENDERED_AT = Date.parse("2026-11-14T22:00:00.000Z");
const MINUTE = 60_000;

function makeOrder(
  id: number,
  code: string,
  overrides: Partial<{
    createdAt: string;
    currencyCode: "UYU" | "USD";
    customerName: string;
    phoneVerified: boolean;
    status: "delivered" | "packed" | "received" | "undeliverable";
    totalAmount: number;
  }> = {}
) {
  return {
    code,
    createdAt: new Date(RENDERED_AT - id * MINUTE).toISOString(),
    currencyCode: "UYU" as const,
    customerName: `Customer ${code}`,
    id,
    phoneVerified: false,
    status: "received" as const,
    totalAmount: 129_000,
    ...overrides,
  };
}

type Order = ReturnType<typeof makeOrder>;

const COUNTS = { delivered: 7, packed: 2, received: 3, undeliverable: 1 };

interface Page {
  items: Order[];
  nextCursor: { createdAt: string; id: number } | null;
}

function onePage(items: Order[]): Page {
  return { items, nextCursor: null };
}

/** Each answer is a page, a failure, or no answer at all. */
type Answer = Page | "fail" | "hang";

const FAILURE = {
  code: "INTERNAL_SERVER_ERROR",
  message: "Internal server error",
  status: 500,
};

/**
 * `order.list` answered per call by `answer`: a page, oRPC's error, or no
 * answer at all.
 */
function listHandler(answer: (input: unknown) => Answer): RequestHandler {
  return http.post<never, { json?: unknown }>(
    "*/api/orpc/order/list",
    async ({ request }) => {
      const body = await request.json();
      const answered = answer(body.json);

      if (answered === "hang") {
        return await new Promise<never>(() => {});
      }

      if (answered === "fail") {
        return HttpResponse.json(
          { defined: true, ...FAILURE },
          { status: FAILURE.status }
        );
      }

      return HttpResponse.json({ json: answered, meta: [] });
    }
  );
}

function hasCursor(input: unknown) {
  return typeof input === "object" && input !== null && "cursor" in input;
}

interface SetupOptions {
  counts?: "fail" | "ok";
  /** `order.list`'s answers, in turn; the last one repeats. */
  lists?: Answer[];
  locale?: Locale;
  /** `order.list`'s answer for the next page, from a cursor. */
  nextPage?: Answer;
  query?: OrdersQuery;
  sound?: "off" | "on";
}

function setup({
  counts = "ok",
  lists = [onePage([makeOrder(1, "AB3CD")])],
  locale = "en",
  nextPage = onePage([]),
  query = {},
  sound,
}: SetupOptions = {}) {
  vi.setSystemTime(RENDERED_AT);

  if (sound) {
    window.localStorage.setItem(ORDER_SOUND_STORAGE_KEY, sound);
  }

  const beeps: number[] = [];
  vi.stubGlobal(
    "AudioContext",
    class {
      currentTime = 0;
      destination = {};
      state = "running";

      createGain() {
        return {
          connect: (next: unknown) => next,
          gain: {
            exponentialRampToValueAtTime: vi.fn(),
            setValueAtTime: vi.fn(),
          },
        };
      }

      createOscillator() {
        return {
          connect: (next: unknown) => next,
          frequency: { value: 0 },
          start: vi.fn(),
          stop: () => {
            beeps.push(Date.now());
          },
        };
      }
    }
  );

  let answered = 0;
  const list = vi.fn((input: unknown): Answer => {
    if (hasCursor(input)) {
      return nextPage;
    }

    const answer = lists[Math.min(answered, lists.length - 1)] ?? "fail";
    answered += 1;
    return answer;
  });
  const countsSpy = vi.fn((_input: unknown) => COUNTS);
  server.use(
    listHandler(list),
    counts === "fail"
      ? createOrpcErrorHandler("order.counts", FAILURE)
      : createOrpcHandler("order.counts", countsSpy)
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
    <OrderManager
      query={query}
      renderedAt={RENDERED_AT}
      storeSlug="lr-market"
    />,
    { locale, wrapper: Providers }
  );

  const row = (code: string) => screen.getByTestId(`order-row-${code}`);
  const codes = () =>
    within(screen.getByTestId("order-list"))
      .getAllByRole("listitem")
      .map((item) => item.querySelector(".font-mono")?.textContent);
  const tabs = (name = "Filter by status") =>
    within(screen.getByRole("navigation", { name }))
      .getAllByRole("link")
      .map((link) => [
        link.textContent,
        link.getAttribute("href"),
        link.getAttribute("aria-current"),
      ]);

  return {
    beeps,
    codes,
    countsSpy,
    list,
    liveRegion: () => screen.getByRole("status"),
    queryClient,
    refresh: async () => {
      await act(async () => {
        await queryClient.refetchQueries();
      });
    },
    row,
    tabs,
    user,
  };
}

describe("OrderManager", () => {
  test("lists each order as a link to it, with its code, customer, total, age, status and phone", async () => {
    const { list, row } = setup({
      lists: [
        onePage([
          makeOrder(2, "K7P2Q", {
            customerName: "Ana Pérez",
            phoneVerified: true,
            status: "packed",
            totalAmount: 1250,
          }),
          makeOrder(65, "AB3CD", { currencyCode: "USD" }),
        ]),
      ],
    });

    const first = await screen.findByTestId("order-row-K7P2Q");
    const link = within(first).getByRole("link");
    expect(link).toHaveAttribute("href", "/en/admin/lr-market/orders/2");
    expect(link).toHaveTextContent(
      /^K7P2QPackedAna PérezUYU 12.502 minutes agoPhone confirmed: Yes$/u
    );
    expect(within(row("AB3CD")).getByRole("link")).toHaveTextContent(
      /^AB3CDReceivedCustomer AB3CDUSD 1,2901 hour agoPhone confirmed: No$/u
    );
    expect(within(first).getByRole("time")).toHaveAttribute(
      "datetime",
      "2026-11-14T21:58:00.000Z"
    );
    expect(list).toHaveBeenCalledExactlyOnceWith({ storeSlug: "lr-market" });
  });

  test("speaks Spanish in its rows, tabs and search", async () => {
    const { row, tabs } = setup({ locale: "es" });

    expect(await screen.findByTestId("order-row-AB3CD")).toBeInTheDocument();
    expect(within(row("AB3CD")).getByRole("link")).toHaveTextContent(
      /^AB3CDRecibidoCustomer AB3CD\$ 1\.290hace 1 minutoTeléfono confirmado: No$/u
    );
    await waitFor(() => {
      expect(tabs("Filtrar por estado").map(([text]) => text)).toEqual([
        "Todos (13)",
        "Recibido (3)",
        "Preparado (2)",
        "Entregado (7)",
        "No se pudo entregar (1)",
      ]);
    });
    expect(
      screen.getByRole("searchbox", { name: "Buscar pedidos" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 1, name: "Pedidos" })
    ).toBeInTheDocument();
  });

  test("offers every status as a tab with its count, keeping the search, the one on screen current", async () => {
    const { countsSpy, tabs } = setup({
      query: { q: "ana", status: "packed" },
    });

    await waitFor(() => {
      expect(tabs()).toEqual([
        ["All (13)", "/en/admin/lr-market/orders?q=ana", null],
        [
          "Received (3)",
          "/en/admin/lr-market/orders?status=received&q=ana",
          null,
        ],
        [
          "Packed (2)",
          "/en/admin/lr-market/orders?status=packed&q=ana",
          "page",
        ],
        [
          "Delivered (7)",
          "/en/admin/lr-market/orders?status=delivered&q=ana",
          null,
        ],
        [
          "Couldn't deliver (1)",
          "/en/admin/lr-market/orders?status=undeliverable&q=ana",
          null,
        ],
      ]);
    });
    expect(countsSpy).toHaveBeenCalledExactlyOnceWith({
      storeSlug: "lr-market",
    });
    expect(
      screen.getByRole("searchbox", { name: "Search orders" })
    ).toHaveValue("ana");
  });

  test("makes All current with no status, and shows the tabs without counts it could not read", async () => {
    const { tabs } = setup({ counts: "fail" });

    await screen.findByTestId("order-row-AB3CD");

    expect(tabs()).toEqual([
      ["All", "/en/admin/lr-market/orders", "page"],
      ["Received", "/en/admin/lr-market/orders?status=received", null],
      ["Packed", "/en/admin/lr-market/orders?status=packed", null],
      ["Delivered", "/en/admin/lr-market/orders?status=delivered", null],
      [
        "Couldn't deliver",
        "/en/admin/lr-market/orders?status=undeliverable",
        null,
      ],
    ]);
  });

  test("reads the list for the status and the search in the address", async () => {
    const { list } = setup({ query: { q: "ana", status: "received" } });

    await screen.findByTestId("order-row-AB3CD");

    expect(list).toHaveBeenCalledExactlyOnceWith({
      q: "ana",
      status: "received",
      storeSlug: "lr-market",
    });
  });

  test("waits behind a skeleton with the list's geometry, saying nothing is empty", () => {
    setup({ lists: ["hang"] });

    expect(screen.getByTestId("order-list-skeleton")).toHaveAttribute(
      "aria-busy",
      "true"
    );
    expect(screen.queryByTestId("empty-state")).not.toBeInTheDocument();
  });

  test.each([
    [{}, "No orders yet. When someone buys from the store, it shows up here."],
    [{ status: "received" }, "No orders waiting to be packed."],
    [{ status: "packed" }, "No packed orders waiting for delivery."],
    [{ status: "delivered" }, "No delivered orders yet."],
    [{ status: "undeliverable" }, "No orders that couldn't be delivered."],
    [{ q: "zz", status: "packed" }, "No order matches “zz”."],
  ] as const)("with nothing for %j, says %j", async (query, message) => {
    setup({ lists: [onePage([])], query });

    expect(await screen.findByTestId("empty-state")).toHaveTextContent(
      new RegExp(`^${message}$`, "u")
    );
    expect(screen.queryByTestId("order-list")).not.toBeInTheDocument();
  });

  test("a failed list says so and reads again on retry, never showing it empty", async () => {
    const { list, user } = setup({
      lists: ["fail", onePage([makeOrder(1, "AB3CD")])],
    });

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("We couldn't load the orders.");
    expect(screen.queryByTestId("empty-state")).not.toBeInTheDocument();

    await user.click(within(alert).getByRole("button", { name: "Try again" }));

    expect(await screen.findByTestId("order-row-AB3CD")).toBeInTheDocument();
    expect(list).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  test("marks an order placed after the screen opened as new and announces it, once", async () => {
    const arrived = makeOrder(9, "K7P2Q", {
      createdAt: new Date(RENDERED_AT + MINUTE).toISOString(),
    });
    const { codes, liveRegion, refresh, row } = setup({
      lists: [
        onePage([makeOrder(1, "AB3CD")]),
        onePage([arrived, makeOrder(1, "AB3CD")]),
      ],
    });
    await screen.findByTestId("order-row-AB3CD");
    expect(liveRegion()).toHaveTextContent(/^$/u);

    await refresh();

    await waitFor(() => {
      expect(codes()).toEqual(["K7P2Q", "AB3CD"]);
    });
    expect(within(row("K7P2Q")).getByTestId("order-new")).toHaveTextContent(
      /^New$/u
    );
    expect(within(row("AB3CD")).queryByTestId("order-new")).toBeNull();
    expect(liveRegion()).toHaveTextContent(/^Order K7P2Q arrived$/u);
    expect(liveRegion()).toHaveAttribute("aria-live", "polite");
  });

  test("an order placed exactly as the screen opened is not new", async () => {
    setup({
      lists: [
        onePage([
          makeOrder(1, "AB3CD", {
            createdAt: new Date(RENDERED_AT).toISOString(),
          }),
        ]),
      ],
    });

    const only = await screen.findByTestId("order-row-AB3CD");

    expect(within(only).queryByTestId("order-new")).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent(/^$/u);
  });

  test("announces several arrivals together, and beeps once when the sound is on", async () => {
    const first = makeOrder(8, "K7P2Q", {
      createdAt: new Date(RENDERED_AT + MINUTE).toISOString(),
    });
    const second = makeOrder(9, "ZZ9XY", {
      createdAt: new Date(RENDERED_AT + 2 * MINUTE).toISOString(),
    });
    const { beeps, liveRegion, refresh } = setup({
      lists: [onePage([makeOrder(1, "AB3CD")]), onePage([second, first])],
      sound: "on",
    });
    await screen.findByTestId("order-row-AB3CD");
    expect(beeps).toEqual([]);

    await refresh();

    await waitFor(() => {
      expect(liveRegion()).toHaveTextContent(
        /^2 orders arrived: ZZ9XY, K7P2Q$/u
      );
    });
    expect(beeps).toEqual([RENDERED_AT]);

    await refresh();

    expect(liveRegion()).toHaveTextContent(/^2 orders arrived: ZZ9XY, K7P2Q$/u);
    expect(beeps).toEqual([RENDERED_AT]);
  });

  test("stays silent on an arrival while the sound is off", async () => {
    const { beeps, liveRegion, refresh } = setup({
      lists: [
        onePage([]),
        onePage([
          makeOrder(9, "K7P2Q", {
            createdAt: new Date(RENDERED_AT + MINUTE).toISOString(),
          }),
        ]),
      ],
      sound: "off",
    });
    await screen.findByTestId("empty-state");

    await refresh();

    await waitFor(() => {
      expect(liveRegion()).toHaveTextContent(/^Order K7P2Q arrived$/u);
    });
    expect(beeps).toEqual([]);
  });

  test("the sound is a toggle, off at first, remembered once turned on", async () => {
    const { beeps, user } = setup();
    const toggle = screen.getByRole("button", {
      name: "Sound when an order arrives",
    });
    expect(toggle).toHaveAttribute("aria-pressed", "false");

    await user.click(toggle);

    expect(toggle).toHaveAttribute("aria-pressed", "true");
    expect(window.localStorage.getItem(ORDER_SOUND_STORAGE_KEY)).toBe("on");
    // Turning it on plays what an arrival sounds like.
    expect(beeps).toEqual([RENDERED_AT]);

    await user.click(toggle);

    expect(toggle).toHaveAttribute("aria-pressed", "false");
    expect(window.localStorage.getItem(ORDER_SOUND_STORAGE_KEY)).toBe("off");
  });

  test("loads the next page on demand, focusing its first order", async () => {
    const { codes, list, user } = setup({
      lists: [
        {
          items: [makeOrder(1, "AB3CD")],
          nextCursor: { createdAt: "2026-11-14T21:59:00.000Z", id: 1 },
        },
      ],
      nextPage: onePage([makeOrder(2, "K7P2Q")]),
    });
    await screen.findByTestId("order-row-AB3CD");

    await user.click(screen.getByRole("button", { name: "Load more" }));

    await waitFor(() => {
      expect(codes()).toEqual(["AB3CD", "K7P2Q"]);
    });
    expect(list).toHaveBeenLastCalledWith({
      cursor: { createdAt: "2026-11-14T21:59:00.000Z", id: 1 },
      storeSlug: "lr-market",
    });
    await waitFor(() => {
      expect(
        within(screen.getByTestId("order-row-K7P2Q")).getByRole("link")
      ).toHaveFocus();
    });
    expect(
      screen.queryByRole("button", { name: "Load more" })
    ).not.toBeInTheDocument();
  });

  test("says it is loading the next page and takes no second tap meanwhile", async () => {
    const { list, user } = setup({
      lists: [
        {
          items: [makeOrder(1, "AB3CD")],
          nextCursor: { createdAt: "2026-11-14T21:59:00.000Z", id: 1 },
        },
      ],
      nextPage: "hang",
    });
    await screen.findByTestId("order-row-AB3CD");

    await user.click(screen.getByRole("button", { name: "Load more" }));
    const loading = await screen.findByRole("button", { name: "Loading…" });
    expect(loading).toHaveAttribute("aria-disabled", "true");
    await user.click(loading);

    expect(list.mock.calls.filter(([input]) => hasCursor(input))).toEqual([
      [
        {
          cursor: { createdAt: "2026-11-14T21:59:00.000Z", id: 1 },
          storeSlug: "lr-market",
        },
      ],
    ]);
  });

  test("a next page that fails says so and keeps the orders on screen", async () => {
    const { codes, user } = setup({
      lists: [
        {
          items: [makeOrder(1, "AB3CD")],
          nextCursor: { createdAt: "2026-11-14T21:59:00.000Z", id: 1 },
        },
      ],
      nextPage: "fail",
    });
    await screen.findByTestId("order-row-AB3CD");

    await user.click(screen.getByRole("button", { name: "Load more" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /^We couldn't load more orders\.$/u
    );
    expect(codes()).toEqual(["AB3CD"]);
    expect(screen.getByRole("button", { name: "Load more" })).toBeEnabled();
  });
});
