import { screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { renderWithI18n } from "@/test/i18n";

import { OrderPhoneVerified } from "./order-phone-verified";

describe("OrderPhoneVerified", () => {
  test.each([
    [true, "en", "Phone confirmed: Yes", "lucide-shield-check"],
    [false, "en", "Phone confirmed: No", "lucide-shield-alert"],
    [true, "es", "Teléfono confirmado: Sí", "lucide-shield-check"],
    [false, "es", "Teléfono confirmado: No", "lucide-shield-alert"],
  ] as const)(
    "confirmed %s in %s reads %j beside its icon",
    (verified, locale, text, icon) => {
      renderWithI18n(
        <OrderPhoneVerified className="custom" verified={verified} />,
        { locale }
      );

      const indicator = screen.getByText(text);
      expect(indicator).toHaveAttribute("data-slot", "order-phone-verified");
      expect(indicator).toHaveClass("custom");
      expect(indicator.querySelector("svg")).toHaveClass(icon);
      expect(indicator.querySelector("svg")).toHaveAttribute(
        "aria-hidden",
        "true"
      );
    }
  );
});
