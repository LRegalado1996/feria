import { useQueryClient } from "@tanstack/react-query";
import { act, render, screen } from "@testing-library/react";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { describe, expect, test } from "vitest";

import { AppProviders } from "./app-providers";

function Consumer() {
  const queryClient = useQueryClient();
  const { setTheme, theme } = useTheme();

  return (
    <button
      onClick={() => {
        setTheme("dark");
      }}
      type="button"
    >
      {`theme:${theme ?? "none"} queries:${String(Boolean(queryClient))}`}
    </button>
  );
}

function setup() {
  // next-themes remembers a choice in localStorage and as a class on <html>.
  localStorage.clear();
  document.documentElement.className = "";

  return render(
    <AppProviders>
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
