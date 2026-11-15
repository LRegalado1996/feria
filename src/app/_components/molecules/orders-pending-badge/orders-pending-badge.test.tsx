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
      <span>
        {locale === "en" ? "Orders" : "Pedidos"}
        <OrdersPendingBadge className="custom" storeSlug="lr-market" />
      </span>
    </Link>,
    { locale, wrapper: Providers }
  );

  return { counts, queryClient };
}

describe("OrdersPendingBadge", () => {
  // happy-dom computes no display for a span, so the name it gives has a
  // space between every box: the exact name, "Pedidos, 1 sin preparar", is
  // asserted in Chromium (`e2e/tests/admin/orders.e2e.ts`). Here: the text
  // that joins the label, and the plain inline boxes that let it join.
  test.each([
    ["en", 3, ", 3 to pack", "3"],
    ["en", 1, ", 1 to pack", "1"],
    ["en", 1280, ", 1,280 to pack", "1,280"],
    ["es", 3, ", 3 sin preparar", "3"],
    ["es", 1, ", 1 sin preparar", "1"],
  ] as const)(
    "in %s, with %i to pack, adds %j to the link's name and shows %j",
    async (locale, received, spoken, figure) => {
      const { counts } = setup({ locale, received });

      const badge = await screen.findByTestId("orders-pending-badge");
      const label = locale === "en" ? "Orders" : "Pedidos";
      const link = screen.getByRole("link");
      expect(link).toContainElement(badge);
      expect(link.textContent).toBe(`${label}${spoken}${figure}`);
      expect(badge).toHaveAttribute("data-slot", "orders-pending-badge");
      // No layout of its own: a flex or positioned box would part the name.
      expect(badge.className).toBe("custom");
      const [text, shown] = [...badge.children];
      expect(text).toHaveTextContent(new RegExp(`^${spoken}$`, "u"));
      expect(text?.className).toBe("sr-only-inline");
      expect(text).not.toHaveAttribute("aria-hidden");
      expect(shown).toHaveAttribute("aria-hidden", "true");
      expect(shown).toHaveTextContent(new RegExp(`^${figure}$`, "u"));
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
