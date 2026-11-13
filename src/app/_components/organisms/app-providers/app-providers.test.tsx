import { useQueryClient } from "@tanstack/react-query";
import { act, render, screen } from "@testing-library/react";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { describe, expect, test } from "vitest";

import { useDictionary, useLocale } from "@/lib/hooks/i18n";
import type { Locale } from "@/lib/i18n/config";
import { DICTIONARIES } from "@/test/i18n";

import { AppProviders } from "./app-providers";

function Consumer() {
  const queryClient = useQueryClient();
  const { setTheme, theme } = useTheme();
  const { common } = useDictionary();
  const locale = useLocale();

  return (
    <button
      onClick={() => {
        setTheme("dark");
      }}
      type="button"
    >
      {`theme:${theme ?? "none"} queries:${String(Boolean(queryClient))} ${locale}:${common.tryAgain}`}
    </button>
  );
}

function setup(locale: Locale = "en") {
  // next-themes remembers a choice in localStorage and as a class on <html>.
  localStorage.clear();
  document.documentElement.className = "";

  return render(
    <AppProviders dictionary={DICTIONARIES[locale]} locale={locale}>
      <Consumer />
    </AppProviders>
  );
}

describe("AppProviders", () => {
  test("gives its children the query client and the theme, defaulting to the system's", () => {
    setup();

    expect(screen.getByRole("button")).toHaveTextContent(
      "theme:system queries:true"
    );
    expect(screen.getByRole("button").parentElement).toHaveAttribute(
      "data-slot",
      "app-providers"
    );
  });

  test.each([
    ["es", "es:Reintentar"],
    ["en", "en:Try again"],
  ] as const)(
    "gives its children the %s locale and its interface text",
    (locale, expected) => {
      setup(locale);

      expect(screen.getByRole("button")).toHaveTextContent(expected);
    }
  );

  test("applies a chosen theme as a class on <html>", () => {
    setup();

    act(() => {
      screen.getByRole("button").click();
    });

    expect(document.documentElement).toHaveClass("dark");
    expect(screen.getByRole("button")).toHaveTextContent("theme:dark");
  });

  test("mounts the toast region", async () => {
    setup();

    act(() => {
      toast.success("Post published.");
    });

    expect(await screen.findByText("Post published.")).toBeInTheDocument();
  });
});
