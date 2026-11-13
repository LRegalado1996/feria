import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { describe, expect, test, vi } from "vitest";

import { Toaster } from "@/app/_components/molecules/sonner";
import { reportError } from "@/lib/errors/client";
import { server } from "@/test/msw";

import { Navbar, type NavbarProps } from "./navbar";

vi.mock("@/lib/errors/client", () => ({ reportError: vi.fn() }));

function setup(
  props: Partial<NavbarProps> = {},
  signOutResponse: () => Promise<Response> | Response = () =>
    HttpResponse.json({ success: true })
) {
  const signOut = vi.fn(signOutResponse);
  server.use(http.post("*/api/auth/sign-out", signOut));
  const assign = vi
    .spyOn(window.location, "assign")
    .mockImplementation(() => undefined);
  const user = userEvent.setup();

  render(
    <>
      <Navbar user={{ name: "Alice Johnson", image: null }} {...props} />
      <Toaster />
    </>
  );

  return { assign, signOut, user };
}

describe("Navbar", () => {
  test("renders the banner with its slot, the page title and the user", () => {
    setup({ className: "custom-class" });

    const header = screen.getByRole("banner");
    expect(header).toHaveAttribute("data-slot", "navbar");
    expect(header).toHaveClass("custom-class");
    expect(screen.getByRole("heading", { name: "Feed" })).toBeInTheDocument();
    expect(screen.getByText("Alice Johnson")).toBeInTheDocument();
  });

  test("shows the user's initial until the picture loads", () => {
    setup({
      user: { name: "Bob Smith", image: "https://example.com/avatar.jpg" },
    });

    expect(screen.getByText("B")).toBeInTheDocument();
  });

  test("offers the theme toggle", () => {
    setup();

    expect(
      screen.getByRole("button", { name: "Change theme" })
    ).toBeInTheDocument();
  });

  test("signs out, then reloads the page", async () => {
    const { assign, signOut, user } = setup();

    await user.click(screen.getByRole("button", { name: "Sign out" }));

    await waitFor(() => {
      expect(assign).toHaveBeenCalledExactlyOnceWith("/");
    });
    expect(signOut).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        request: expect.objectContaining({
          method: "POST",
          url: "http://localhost:3000/api/auth/sign-out",
        }),
      })
    );
  });

  test("says signing out failed when the server refuses, and lets the user retry", async () => {
    const { assign, user } = setup({}, () =>
      HttpResponse.json({ message: "Internal error" }, { status: 500 })
    );

    await user.click(screen.getByRole("button", { name: "Sign out" }));

    expect(
      await screen.findByText("You are still signed in. Try again.")
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign out" })).toBeEnabled();
    expect(assign).not.toHaveBeenCalled();
    // A refusal is an answer, not a defect: nothing is reported.
    expect(reportError).not.toHaveBeenCalled();
  });

  test("says signing out failed when the request never completes", async () => {
    const { assign, user } = setup({}, () => HttpResponse.error());

    await user.click(screen.getByRole("button", { name: "Sign out" }));

    expect(
      await screen.findByText("You are still signed in. Try again.")
    ).toBeInTheDocument();
    expect(assign).not.toHaveBeenCalled();
    expect(reportError).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        name: "TypeError",
        message: "Failed to fetch",
      }),
      { action: "Auth.sign_out" }
    );
  });

  test("disables the button while signing out", async () => {
    const { user } = setup({}, async () => await new Promise(() => {}));

    await user.click(screen.getByRole("button", { name: "Sign out" }));

    expect(
      await screen.findByRole("button", { name: "Signing out…" })
    ).toBeDisabled();
  });
});
