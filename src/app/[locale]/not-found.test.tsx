import { screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { renderWithI18n } from "@/test/i18n";

import NotFound from "./not-found";

describe("NotFound", () => {
  test.each([
    [
      "es",
      "Página no encontrada",
      "La dirección que abriste no existe o ya no está disponible.",
      "Ir a la página de inicio",
      "/",
    ],
    [
      "en",
      "Page not found",
      "The address you opened does not exist or is no longer available.",
      "Go to the home page",
      "/en",
    ],
  ] as const)(
    "in %s, says so and offers a way back to that language's home",
    (locale, title, description, link, home) => {
      renderWithI18n(<NotFound />, { locale });

      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
        title
      );
      expect(screen.getByText(description)).toBeInTheDocument();
      expect(screen.getByTestId("not-found-home-link")).toHaveTextContent(link);
      expect(screen.getByTestId("not-found-home-link")).toHaveAttribute(
        "href",
        home
      );
      // React hoists the <title> into <head>.
      expect(document.title).toBe(title);
    }
  );
});
