import { screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import type { Locale } from "@/lib/i18n/config";
import type { OrderStatus } from "@/lib/schemas/order";
import { renderWithI18n } from "@/test/i18n";

import { OrderStatusBadge } from "./order-status-badge";

function setup(status: OrderStatus, locale: Locale = "en") {
  renderWithI18n(<OrderStatusBadge className="custom" status={status} />, {
    locale,
  });
  const badge = screen.getByText(
    (_content, element) =>
      element instanceof HTMLElement &&
      element.dataset.slot === "order-status-badge"
  );

  return {
    badge,
    icon: badge.querySelector("svg"),
  };
}

describe("OrderStatusBadge", () => {
  test.each([
    ["received", "en", "Received", "lucide-inbox", "bg-amber-100"],
    ["packed", "en", "Packed", "lucide-package", "bg-blue-100"],
    ["delivered", "en", "Delivered", "lucide-circle-check", "bg-emerald-100"],
    [
      "undeliverable",
      "en",
      "Couldn't deliver",
      "lucide-circle-x",
      "bg-red-100",
    ],
    ["received", "es", "Recibido", "lucide-inbox", "bg-amber-100"],
    ["packed", "es", "Preparado", "lucide-package", "bg-blue-100"],
    ["delivered", "es", "Entregado", "lucide-circle-check", "bg-emerald-100"],
    [
      "undeliverable",
      "es",
      "No se pudo entregar",
      "lucide-circle-x",
      "bg-red-100",
    ],
  ] as const)(
    "%s in %s reads %j beside its own icon, never a color alone",
    (status, locale, label, icon, tone) => {
      const { badge, icon: svg } = setup(status, locale);

      expect(badge).toHaveTextContent(new RegExp(`^${label}$`, "u"));
      expect(badge).toHaveAttribute("data-status", status);
      expect(badge).toHaveClass(tone, "custom");
      expect(svg).toHaveClass(icon);
      expect(svg).toHaveAttribute("aria-hidden", "true");
    }
  );
});
