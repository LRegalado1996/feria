import { render, screen } from "@testing-library/react";
import { use } from "react";
import { describe, expect, test } from "vitest";

import { DICTIONARIES } from "@/test/i18n";

import { I18nContext, I18nProvider } from "./provider";

function Probe() {
  const value = use(I18nContext);

  return (
    <p>
      {value
        ? `${value.locale}: ${value.dictionary.auth.welcome.title}`
        : "no provider"}
    </p>
  );
}

describe("I18nProvider", () => {
  test.each([
    ["es", "es: Hola de nuevo"],
    ["en", "en: Welcome back"],
  ] as const)(
    "hands its children the %s locale and its dictionary",
    (locale, expected) => {
      render(
        <I18nProvider dictionary={DICTIONARIES[locale]} locale={locale}>
          <Probe />
        </I18nProvider>
      );

      expect(screen.getByRole("paragraph")).toHaveTextContent(expected);
    }
  );

  test("has no default: outside the provider there is nothing to read", () => {
    render(<Probe />);

    expect(screen.getByRole("paragraph")).toHaveTextContent("no provider");
  });
});
