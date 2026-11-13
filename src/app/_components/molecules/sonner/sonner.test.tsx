import { act, render, screen } from "@testing-library/react";
import { toast } from "sonner";
import { describe, expect, test, vi } from "vitest";

import { Toaster } from "./sonner";

const { useTheme } = vi.hoisted(() => ({
  useTheme: vi.fn((): { theme?: string } => ({ theme: "light" })),
}));

vi.mock("next-themes", () => ({ useTheme }));

function setup(theme: string | undefined) {
  useTheme.mockReturnValue({ theme });
  render(<Toaster />);

  act(() => {
    toast.error("Your post could not be published.");
  });

  return { toaster: screen.getByRole("region") };
}

describe("Toaster", () => {
  test("announces a toast in a labelled region", async () => {
    const { toaster } = setup("light");

    expect(toaster).toHaveAccessibleName(/Notifications/u);
    expect(
      await screen.findByText("Your post could not be published.")
    ).toBeInTheDocument();
  });

  // happy-dom's system preference is light, so "system" draws light.
  test.each([
    ["light", "light"],
    ["dark", "dark"],
    ["high-contrast", "light"],
    [undefined, "light"],
  ])("the %s theme draws toasts %s", async (theme, expected) => {
    setup(theme);

    const list = (
      await screen.findByText("Your post could not be published.")
    ).closest("ol");
    expect(list).toHaveAttribute("data-sonner-theme", expected);
  });
});
