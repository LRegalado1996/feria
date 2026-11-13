import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http, type RequestHandler } from "msw";
import { describe, expect, test, vi } from "vitest";

import { reportError } from "@/lib/errors/client";
import { collectHydrationErrors } from "@/test/hydration";
import { server } from "@/test/msw";

import { AuthForm, type AuthFormProps } from "./auth-form";

vi.mock("@/lib/errors/client", () => ({ reportError: vi.fn() }));

const SIGN_IN = "*/api/auth/sign-in/email";
const SIGN_UP = "*/api/auth/sign-up/email";

const VALID = { email: "test@example.com", password: "password123" };

function setup(props: AuthFormProps = {}, ...handlers: RequestHandler[]) {
  server.use(...handlers);
  const assign = vi
    .spyOn(window.location, "assign")
    .mockImplementation(() => undefined);
  const user = userEvent.setup();

  render(<AuthForm {...props} />);

  async function fill(values: {
    email?: string;
    name?: string;
    password?: string;
  }) {
    for (const [label, value] of [
      ["Name", values.name],
      ["Email", values.email],
      ["Password", values.password],
    ] as const) {
      if (value) {
        await user.type(screen.getByLabelText(new RegExp(`^${label}`)), value);
      }
    }
  }

  async function submit() {
    await user.click(screen.getByRole("button", { name: /^Sign (In|Up)$/ }));
  }

  async function switchMode() {
    await user.click(screen.getByRole("button", { name: /account\?/ }));
  }

  return { assign, fill, submit, switchMode };
}

/** The submit button in a rendered HTML string. */
function submitButtonIn(html: string) {
  const container = document.createElement("div");
  container.innerHTML = html;
  return container.querySelector('button[type="submit"]');
}

/** Better Auth's error body: a machine `code` and a message never shown. */
function refuse(url: string, status: number, code: string) {
  return http.post(url, () =>
    HttpResponse.json({ code, message: `library text for ${code}` }, { status })
  );
}

describe("AuthForm modes", () => {
  test("starts on sign-in: email and password, no name", () => {
    setup();

    expect(screen.getByLabelText(/^Email/)).toHaveAccessibleName("Email");
    expect(
      screen
        .getByLabelText(/^Email/)
        .closest('[data-slot="form-item"]')
        ?.querySelector('[data-slot="label-required"]')
    ).toHaveTextContent("*");
    expect(screen.getByLabelText(/^Email/)).toHaveAttribute(
      "autocomplete",
      "email"
    );
    expect(screen.getByLabelText(/^Password/)).toHaveAttribute(
      "autocomplete",
      "current-password"
    );
    expect(screen.getByLabelText(/^Password/)).toHaveAttribute(
      "type",
      "password"
    );
    expect(
      screen.getByRole("button", { name: "Show password" })
    ).toBeInTheDocument();
    expect(screen.queryByLabelText(/^Name/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign In" })).toBeInTheDocument();
  });

  test("starts on sign-up when asked, with a name and a new password", () => {
    setup({ initialMode: "signup" });

    expect(screen.getByLabelText(/^Name/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Password/)).toHaveAttribute(
      "autocomplete",
      "new-password"
    );
    expect(screen.getByRole("button", { name: "Sign Up" })).toBeInTheDocument();
  });

  test("switching modes starts a fresh form: nothing typed carries over", async () => {
    const { fill, switchMode } = setup();
    await fill({ email: "test@example.com" });

    await switchMode();

    expect(screen.getByLabelText(/^Name/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Email/)).toHaveValue("");

    await switchMode();

    expect(screen.queryByLabelText(/^Name/)).not.toBeInTheDocument();
  });
});

describe("AuthForm validation", () => {
  test("binds a field's error to the field and keeps the user on the form", async () => {
    const { assign, fill, submit } = setup();
    await fill({ email: "test@example.com", password: "123" });

    await submit();

    const password = screen.getByLabelText(/^Password/);
    await waitFor(() => {
      expect(password).toHaveAttribute("aria-invalid", "true");
    });
    expect(password).toHaveAccessibleDescription(
      "Password must be at least 8 characters"
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Password must be at least 8 characters"
    );
    expect(assign).not.toHaveBeenCalled();
  });

  test("refuses an empty email", async () => {
    const { assign, fill, submit } = setup();
    await fill({ password: "password123" });

    await submit();

    expect(
      await screen.findByText("Please enter a valid email")
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/^Email/)).toHaveAttribute(
      "aria-invalid",
      "true"
    );
    expect(assign).not.toHaveBeenCalled();
  });

  test("asks a new account for a name", async () => {
    const { fill, submit } = setup({ initialMode: "signup" });
    await fill({ name: "A", ...VALID });

    await submit();

    expect(
      await screen.findByText("Name must be at least 2 characters")
    ).toBeInTheDocument();
  });
});

describe("AuthForm submission", () => {
  test("signs in, tells the caller, then reloads the page", async () => {
    const onSuccess = vi.fn(() => undefined);
    const signIn = vi.fn((_body: unknown) => undefined);
    const { assign, fill, submit } = setup(
      { onSuccess },
      http.post(SIGN_IN, async ({ request }) => {
        signIn(await request.json());
        return HttpResponse.json({ token: "t", user: { id: "1" } });
      })
    );
    await fill(VALID);

    await submit();

    await waitFor(() => {
      expect(assign).toHaveBeenCalledExactlyOnceWith("/");
    });
    expect(onSuccess).toHaveBeenCalledExactlyOnceWith();
    expect(onSuccess.mock.invocationCallOrder[0]).toBeLessThan(
      assign.mock.invocationCallOrder[0] ?? 0
    );
    expect(signIn).toHaveBeenCalledExactlyOnceWith(VALID);
  });

  test("signs up with the name, then reloads the page", async () => {
    const signUp = vi.fn((_body: unknown) => undefined);
    const { assign, fill, submit } = setup(
      { initialMode: "signup" },
      http.post(SIGN_UP, async ({ request }) => {
        signUp(await request.json());
        return HttpResponse.json({ token: "t", user: { id: "1" } });
      })
    );
    await fill({ name: "Test User", ...VALID });

    await submit();

    await waitFor(() => {
      expect(assign).toHaveBeenCalledExactlyOnceWith("/");
    });
    expect(signUp).toHaveBeenCalledExactlyOnceWith({
      name: "Test User",
      ...VALID,
    });
  });

  test("cannot submit before it hydrates: the browser would put the password in the URL", () => {
    const { clientHtml, errors, serverHtml } = collectHydrationErrors(
      <AuthForm />,
      { serverNowMs: 0, clientNowMs: 1000 }
    );

    expect(submitButtonIn(serverHtml)).toHaveProperty("disabled", true);
    expect(submitButtonIn(clientHtml)).toHaveProperty("disabled", false);
    expect(errors).toEqual([]);
  });

  test("disables the button with a progressive label while in flight", async () => {
    const { fill, submit } = setup(
      {},
      http.post(SIGN_IN, async () => await new Promise(() => {}))
    );
    await fill(VALID);

    await submit();

    expect(
      await screen.findByRole("button", { name: "Signing in…" })
    ).toBeDisabled();
  });

  test.each([
    [
      SIGN_IN,
      "signin",
      401,
      "INVALID_EMAIL_OR_PASSWORD",
      "Invalid email or password.",
    ],
    [
      SIGN_UP,
      "signup",
      422,
      "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL",
      "An account with this email already exists.",
    ],
    [
      SIGN_UP,
      "signup",
      422,
      "USER_ALREADY_EXISTS",
      "An account with this email already exists.",
    ],
    [
      SIGN_IN,
      "signin",
      500,
      "INTERNAL_SERVER_ERROR",
      "Sign in failed. Try again.",
    ],
    [
      SIGN_UP,
      "signup",
      400,
      "PASSWORD_TOO_SHORT",
      "Sign up failed. Try again.",
    ],
  ] as const)(
    "%s refused with %s → %i %s says it in our words",
    async (url, initialMode, status, code, message) => {
      const { assign, fill, submit } = setup(
        { initialMode },
        refuse(url, status, code)
      );
      await fill({
        name: initialMode === "signup" ? "Test User" : undefined,
        ...VALID,
      });

      await submit();

      const error = await screen.findByTestId("auth-error");
      expect(error).toHaveTextContent(message);
      expect(error).not.toHaveTextContent("library text");
      expect(error).toHaveAttribute("role", "alert");
      expect(assign).not.toHaveBeenCalled();
      // A refusal is an answer, not a defect: nothing is reported.
      expect(reportError).not.toHaveBeenCalled();
    }
  );

  test("says the server could not be reached when the request fails", async () => {
    const { fill, submit } = setup(
      {},
      http.post(SIGN_IN, () => HttpResponse.error())
    );
    await fill(VALID);

    await submit();

    expect(await screen.findByTestId("auth-error")).toHaveTextContent(
      "We could not reach the server. Check your connection and try again."
    );
    expect(reportError).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        name: "TypeError",
        message: "Failed to fetch",
      }),
      { action: "Auth.sign_in" }
    );
  });

  test("switching modes clears the error", async () => {
    const { fill, submit, switchMode } = setup(
      {},
      refuse(SIGN_IN, 401, "INVALID_EMAIL_OR_PASSWORD")
    );
    await fill(VALID);
    await submit();
    await screen.findByTestId("auth-error");

    await switchMode();

    expect(screen.queryByTestId("auth-error")).not.toBeInTheDocument();
  });
});
