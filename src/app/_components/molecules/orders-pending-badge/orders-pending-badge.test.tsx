import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { screen, waitFor } from "@testing-library/react";
import { ShoppingBag } from "lucide-react";
import type { ReactNode } from "react";
import { describe, expect, test, vi } from "vitest";

import { AdminNav } from "@/app/_components/molecules/admin-nav";
import { useOrderCounts } from "@/lib/hooks/order";
import type { Locale } from "@/lib/i18n/config";
import { renderWithI18n } from "@/test/i18n";
import { createOrpcErrorHandler, createOrpcHandler, server } from "@/test/msw";

import { OrdersPendingBadge } from "./orders-pending-badge";

vi.mock("@/lib/orpc/client", async () => {
  const { orpcClientMock } = await import("@/test/mocks/orpc-client");
  return orpcClientMock;
});

/**
 * The same count beside the badge, shown once it has loaded: it renders in
 * the same commit as the badge, so seeing it proves the badge has rendered
 * the loaded count too, not the state before it.
 */
function LoadedCount() {
  const counts = useOrderCounts();

  return counts.isSuccess ? (
    <p data-testid="loaded-count">{counts.data.received}</p>
  ) : null;
}

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
      <QueryClientProvider client={queryClient}>
        {children}
        <LoadedCount />
      </QueryClientProvider>
    );
  }

  const label = locale === "en" ? "Orders" : "Pedidos";
  renderWithI18n(
    // As the shell renders it: the badge of the navigation's orders link.
    <AdminNav
      items={[
        {
          badge: <OrdersPendingBadge className="custom" label={label} />,
          current: false,
          href: "/admin/orders",
          icon: ShoppingBag,
          label,
        },
      ]}
      label="Sections"
    />,
    { locale, wrapper: Providers }
  );

  return { counts, label, queryClient };
}

describe("OrdersPendingBadge", () => {
  test.each([
    ["en", 3, "Orders, 3 to pack", "3"],
    ["en", 1, "Orders, 1 to pack", "1"],
    ["en", 1280, "Orders, 1,280 to pack", "1,280"],
    ["es", 3, "Pedidos, 3 sin preparar", "3"],
    ["es", 1, "Pedidos, 1 sin preparar", "1"],
  ] as const)(
    "in %s, with %i to pack, names the link %j and shows %j",
    async (locale, received, name, figure) => {
      const { counts, label } = setup({ locale, received });

      const shown = await screen.findByTestId("orders-pending-badge");
      const link = screen.getByRole("link");
      expect(link).toHaveAccessibleName(name);
      expect(link).toContainElement(shown);
      expect(shown).toHaveAttribute("aria-hidden", "true");
      expect(shown).toHaveTextContent(new RegExp(`^${figure}$`, "u"));
      const badge = shown.parentElement;
      expect(badge).toHaveAttribute("data-slot", "orders-pending-badge");
      expect(badge).toHaveClass("custom");
      // The whole name in one ordinary sr-only span, never zero-size text.
      const spoken = badge?.firstElementChild;
      expect(spoken?.className).toBe("sr-only");
      expect(spoken).toHaveTextContent(new RegExp(`^${name}$`, "u"));
      expect(spoken).not.toHaveAttribute("aria-hidden");
      expect(link.textContent).toBe(`${label}${name}${figure}`);
      expect(counts).toHaveBeenCalledExactlyOnceWith(undefined);
    }
  );

  test("names the link with its label alone while the count is on its way", () => {
    setup({ locale: "es" });

    expect(screen.getByRole("link")).toHaveAccessibleName("Pedidos");
    expect(
      screen.queryByTestId("orders-pending-badge")
    ).not.toBeInTheDocument();
  });

  test("names the link with its label alone and shows no figure when no order waits to be packed", async () => {
    const { counts } = setup({ locale: "es", received: 0 });

    expect(await screen.findByTestId("loaded-count")).toHaveTextContent(/^0$/u);
    expect(counts).toHaveBeenCalledExactlyOnceWith(undefined);
    expect(screen.getByRole("link")).toHaveAccessibleName("Pedidos");
    expect(
      screen.queryByTestId("orders-pending-badge")
    ).not.toBeInTheDocument();
  });

  test("names the link with its label alone, never a zero, when the count cannot be read", async () => {
    const { queryClient } = setup({ fails: true });

    await waitFor(() => {
      expect(queryClient.getQueryCache().getAll()[0]?.state.status).toBe(
        "error"
      );
    });
    expect(screen.getByRole("link")).toHaveAccessibleName("Orders");
    expect(
      screen.queryByTestId("orders-pending-badge")
    ).not.toBeInTheDocument();
  });
});
