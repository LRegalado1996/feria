import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { describe, expect, test, vi } from "vitest";

import { Toaster } from "@/app/_components/molecules/sonner";
import { reportError } from "@/lib/errors/client";
import type { Locale } from "@/lib/i18n/config";
import { collectHydrationErrors } from "@/test/hydration";
import { createI18nWrapper, renderWithI18n } from "@/test/i18n";
import { server } from "@/test/msw";

import { SignOutButton } from "./sign-out-button";

vi.mock("@/lib/errors/client", () => ({ reportError: vi.fn() }));

function setup({
  locale = "en",
  respond = () => HttpResponse.json({ success: true }),
}: {
  locale?: Locale;
  respond?: () => Promise<Response> | Response;
} = {}) {
  const signOut = vi.fn(respond);
  server.use(http.post("*/api/auth/sign-out", signOut));
  const assign = vi
    .spyOn(window.location, "assign")
    .mockImplementation(() => undefined);
  const user = userEvent.setup();

  renderWithI18n(
    <>
      <SignOutButton className="custom" redirectTo="/admin/sign-in" />
      <Toaster />
    </>,
    { locale }
  );

  return { assign, signOut, user };
}

function refuse() {
  return HttpResponse.json({ message: "Internal error" }, { status: 500 });
}

async function hang(): Promise<Response> {
  return await new Promise(() => {});
}

describe("SignOutButton", () => {
  test("is a small outline button with its slot and the class it was given", () => {
    setup();

    const button = screen.getByRole("button", { name: "Sign out" });
    expect(button).toHaveAttribute("data-slot", "sign-out-button");
    expect(button).toHaveClass("custom");
    expect(button).toBeEnabled();
  });

  test.each([
    ["en", "Sign out", "/en/admin/sign-in"],
    ["es", "Cerrar sesión", "/admin/sign-in"],
  ] as const)(
    "in %s, ends the session, then reloads into the redirect in that language",
    async (locale, name, landing) => {
      const { assign, signOut, user } = setup({ locale });

      await user.click(screen.getByRole("button", { name }));

      await waitFor(() => {
        expect(assign).toHaveBeenCalledExactlyOnceWith(landing);
      });
      expect(signOut).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          request: expect.objectContaining({
            method: "POST",
            url: "http://localhost:3000/api/auth/sign-out",
          }),
        })
      );
    }
  );

  test.each([
    ["en", "Sign out", "You are still signed in. Try again."],
    ["es", "Cerrar sesión", "Tu sesión sigue abierta. Probá de nuevo."],
  ] as const)(
    "in %s, says the session is still open when the server refuses, and lets the user retry",
    async (locale, name, failed) => {
      const { assign, user } = setup({ locale, respond: refuse });

      await user.click(screen.getByRole("button", { name }));

      expect(await screen.findByText(failed)).toBeInTheDocument();
      expect(screen.getByRole("button", { name })).toBeEnabled();
      expect(assign).not.toHaveBeenCalled();
      // A refusal is an answer, not a defect: nothing is reported.
      expect(reportError).not.toHaveBeenCalled();
    }
  );

  test("reports a request that never completes, and keeps the session", async () => {
    const { assign, user } = setup({ respond: () => HttpResponse.error() });

    await user.click(screen.getByRole("button", { name: "Sign out" }));

    expect(
      await screen.findByText("You are still signed in. Try again.")
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign out" })).toBeEnabled();
    expect(assign).not.toHaveBeenCalled();
    expect(reportError).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        message: "Failed to fetch",
        name: "TypeError",
      }),
      { action: "Auth.sign_out" }
    );
  });

  test.each([
    ["en", "Sign out", "Signing out…"],
    ["es", "Cerrar sesión", "Cerrando sesión…"],
  ] as const)(
    "in %s, is disabled and says so while signing out",
    async (locale, name, pending) => {
      const { user } = setup({ locale, respond: hang });

      await user.click(screen.getByRole("button", { name }));

      expect(
        await screen.findByRole("button", { name: pending })
      ).toBeDisabled();
    }
  );
});

describe("SignOutButton before hydration", () => {
  test("is disabled in the server's HTML and enabled once React owns it", () => {
    const I18n = createI18nWrapper();
    const { clientHtml, errors, serverHtml } = collectHydrationErrors(
      <I18n>
        <SignOutButton redirectTo="/admin/sign-in" />
      </I18n>,
      { clientNowMs: 1000, serverNowMs: 0 }
    );
    const buttonIn = (html: string) => {
      const container = document.createElement("div");
      container.innerHTML = html;
      return container.querySelector("button");
    };

    expect(buttonIn(serverHtml)).toHaveProperty("disabled", true);
    expect(buttonIn(clientHtml)).toHaveProperty("disabled", false);
    expect(errors).toEqual([]);
  });
});
