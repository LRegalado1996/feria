import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { screen, waitFor } from "@testing-library/react";
import Link from "next/link";
import type { ReactNode } from "react";
import { describe, expect, test, vi } from "vitest";

import type { Locale } from "@/lib/i18n/config";
import { renderWithI18n } from "@/test/i18n";
import { createOrpcErrorHandler, createOrpcHandler, server } from "@/test/msw";

import { OrdersPendingBadge } from "./orders-pending-badge";

vi.mock("@/lib/orpc/client", async () => {
  const { orpcClientMock } = await import("@/test/mocks/orpc-client");
  return orpcClientMock;
});

function setup({
  fails = false,
  locale = "en",
  received = 3,
}: { fails?: boolean; locale?: Locale; received?: number } = {}) {
  const counts = vi.fn((_input: unknown) => ({
    delivered: 9,
    packed: 4,
    received,
    undeliverable: 1,
  }));
  server.use(
    fails
      ? createOrpcErrorHandler("order.counts", {
          code: "INTERNAL_SERVER_ERROR",
          message: "Internal server error",
          status: 500,
        })
      : createOrpcHandler("order.counts", counts)
  );
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  function Providers({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  }

  renderWithI18n(
    // As the navigation renders it: inside the section's link.
    <Link href="/admin/lr-market/orders">
      {locale === "en" ? "Orders" : "Pedidos"}
      <OrdersPendingBadge className="custom" storeSlug="lr-market" />
    </Link>,
    { locale, wrapper: Providers }
  );

  return { counts, queryClient };
}

describe("OrdersPendingBadge", () => {
  test.each([
    // The badge is a box of its own, so the name has a space before its
    // comma, as a browser computes it; read aloud, it is the pause.
    ["en", 3, "Orders , 3 to pack", "3"],
    ["en", 1, "Orders , 1 to pack", "1"],
    ["en", 1280, "Orders , 1,280 to pack", "1,280"],
    ["es", 3, "Pedidos , 3 sin preparar", "3"],
    ["es", 1, "Pedidos , 1 sin preparar", "1"],
  ] as const)(
    "in %s, with %i to pack, names the link %j and shows %j",
    async (locale, received, name, figure) => {
      const { counts } = setup({ locale, received });

      const link = await screen.findByRole("link", { name });
      const badge = screen.getByTestId("orders-pending-badge");
      expect(link).toContainElement(badge);
      expect(badge).toHaveAttribute("data-slot", "orders-pending-badge");
      expect(badge).toHaveClass("custom");
      expect(badge.querySelector("[aria-hidden='true']")).toHaveTextContent(
        new RegExp(`^${figure}$`, "u")
      );
      expect(counts).toHaveBeenCalledExactlyOnceWith({
        storeSlug: "lr-market",
      });
    }
  );

  test("shows nothing when no order waits to be packed", async () => {
    const { counts } = setup({ received: 0 });

    await waitFor(() => {
      expect(counts).toHaveBeenCalledExactlyOnceWith({
        storeSlug: "lr-market",
      });
    });
    expect(screen.getByRole("link", { name: "Orders" })).toBeInTheDocument();
    expect(
      screen.queryByTestId("orders-pending-badge")
    ).not.toBeInTheDocument();
  });

  test("shows nothing, never a zero, when the count cannot be read", async () => {
    const { queryClient } = setup({ fails: true });

    await waitFor(() => {
      expect(queryClient.getQueryCache().getAll()[0]?.state.status).toBe(
        "error"
      );
    });
    expect(screen.getByRole("link", { name: "Orders" })).toBeInTheDocument();
    expect(
      screen.queryByTestId("orders-pending-badge")
    ).not.toBeInTheDocument();
  });
});
