import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import { renderWithI18n } from "@/test/i18n";

import { ThemeToggle } from "./theme-toggle";

const { useTheme } = vi.hoisted(() => ({
  useTheme: vi.fn(() => ({
    setTheme: (_theme: string) => undefined,
    theme: "light" as string | undefined,
  })),
}));

vi.mock("next-themes", () => ({ useTheme }));

function setup({
  locale = "en",
  theme = "light",
}: { locale?: "en" | "es"; theme?: string | null } = {}) {
  const setTheme = vi.fn((_theme: string) => undefined);
  useTheme.mockReturnValue({ setTheme, theme: theme ?? undefined });
  const user = userEvent.setup();

  renderWithI18n(<ThemeToggle />, { locale });

  const open = async () => {
    await user.click(screen.getByTestId("theme-toggle"));
  };

  return { open, setTheme, user };
}

describe("ThemeToggle", () => {
  test("is an icon button named for what it does", () => {
    setup();

    const button = screen.getByRole("button", { name: "Change theme" });
    expect(button).toHaveAttribute("data-slot", "theme-toggle");
    expect(button).toHaveTextContent("");
  });

  test("offers light, dark and system, with the current one checked", async () => {
    const { open } = setup({ theme: "dark" });

    await open();

    const options = screen.getAllByRole("menuitemradio");
    expect(options.map((option) => option.textContent)).toEqual([
      "Light",
      "Dark",
      "System",
    ]);
    expect(
      options.map((option) => option.getAttribute("aria-checked"))
    ).toEqual(["false", "true", "false"]);
  });

  test.each([
    ["Light", "dark", "light"],
    ["Dark", "light", "dark"],
    ["System", "light", "system"],
  ] as const)(
    "choosing %s over %s applies %s",
    async (label, current, applied) => {
      const { open, setTheme, user } = setup({ theme: current });
      await open();

      await user.click(screen.getByRole("menuitemradio", { name: label }));

      expect(setTheme).toHaveBeenCalledExactlyOnceWith(applied);
    }
  );

  test("checks nothing before the stored theme is known", async () => {
    const { open } = setup({ theme: null });

    await open();

    expect(
      screen
        .getAllByRole("menuitemradio")
        .map((option) => option.getAttribute("aria-checked"))
    ).toEqual(["false", "false", "false"]);
  });

  test("names itself and its options in Spanish on a Spanish page, applying the same themes", async () => {
    const { open, setTheme, user } = setup({ locale: "es" });

    expect(
      screen.getByRole("button", { name: "Cambiar tema" })
    ).toBeInTheDocument();

    await open();

    expect(
      screen.getAllByRole("menuitemradio").map((option) => option.textContent)
    ).toEqual(["Claro", "Oscuro", "Sistema"]);

    await user.click(screen.getByRole("menuitemradio", { name: "Oscuro" }));

    expect(setTheme).toHaveBeenCalledExactlyOnceWith("dark");
  });
});
