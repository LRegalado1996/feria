import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http, type RequestHandler } from "msw";
import { describe, expect, test, vi } from "vitest";

import { reportError } from "@/lib/errors/client";
import type { Locale } from "@/lib/i18n/config";
import { collectHydrationErrors } from "@/test/hydration";
import { createI18nWrapper, renderWithI18n } from "@/test/i18n";
import { server } from "@/test/msw";

import { AuthForm, type AuthFormProps } from "./auth-form";

vi.mock("@/lib/errors/client", () => ({ reportError: vi.fn() }));

const SIGN_IN = "*/api/auth/sign-in/email";

const VALID = { email: "test@example.com", password: "password123" };

// What the helpers below look the form's controls up by, in each language.
const CONTROLS = {
  en: {
    email: "Email",
    password: "Password",
    submit: "Sign In",
  },
  es: {
    email: "Email",
    password: "Contraseña",
    submit: "Iniciar sesión",
  },
} as const;

function setup(
  { locale = "en", ...props }: AuthFormProps & { locale?: Locale } = {},
  ...handlers: RequestHandler[]
) {
  const controls = CONTROLS[locale];
  server.use(...handlers);
  const assign = vi
    .spyOn(window.location, "assign")
    .mockImplementation(() => undefined);
  const user = userEvent.setup();

  renderWithI18n(<AuthForm {...props} />, { locale });

  async function fill(values: { email?: string; password?: string }) {
    for (const [label, value] of [
      [controls.email, values.email],
      [controls.password, values.password],
    ] as const) {
      if (value) {
        await user.type(screen.getByLabelText(new RegExp(`^${label}`)), value);
      }
    }
  }

  async function submit() {
    await user.click(screen.getByRole("button", { name: controls.submit }));
  }

  return { assign, fill, submit };
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

describe("AuthForm fields", () => {
  test("asks for an email and a password, no name", () => {
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

  test("offers no way to create an account: logins are created for people", () => {
    setup();

    expect(
      screen
        .getAllByRole("button")
        .map(
          (button) => button.getAttribute("aria-label") ?? button.textContent
        )
    ).toEqual(["Show password", "Sign In"]);
    expect(screen.queryByText(/sign up|create/i)).not.toBeInTheDocument();
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
});

describe("AuthForm submission", () => {
  test("signs in, tells the caller, then reloads into the home of the page's language", async () => {
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
      expect(assign).toHaveBeenCalledExactlyOnceWith("/en");
    });
    expect(onSuccess).toHaveBeenCalledExactlyOnceWith();
    expect(onSuccess.mock.invocationCallOrder[0]).toBeLessThan(
      assign.mock.invocationCallOrder[0] ?? 0
    );
    expect(signIn).toHaveBeenCalledExactlyOnceWith(VALID);
  });

  test("lands where the page says once signed in", async () => {
    const { assign, fill, submit } = setup(
      { redirectTo: "/en/admin/lr-market/orders" },
      http.post(SIGN_IN, () =>
        HttpResponse.json({ token: "t", user: { id: "1" } })
      )
    );
    await fill(VALID);

    await submit();

    await waitFor(() => {
      expect(assign).toHaveBeenCalledExactlyOnceWith(
        "/en/admin/lr-market/orders"
      );
    });
  });

  test("cannot submit before it hydrates: the browser would put the password in the URL", () => {
    const I18n = createI18nWrapper();
    const { clientHtml, errors, serverHtml } = collectHydrationErrors(
      <I18n>
        <AuthForm />
      </I18n>,
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
    [401, "INVALID_EMAIL_OR_PASSWORD", "Invalid email or password."],
    [500, "INTERNAL_SERVER_ERROR", "Sign in failed. Try again."],
    [400, "PASSWORD_TOO_SHORT", "Sign in failed. Try again."],
  ] as const)(
    "sign-in refused with %i %s says it in our words",
    async (status, code, message) => {
      const { assign, fill, submit } = setup({}, refuse(SIGN_IN, status, code));
      await fill(VALID);

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
});

describe("AuthForm in Spanish", () => {
  test("labels the form in Spanish", () => {
    setup({ locale: "es" });

    expect(screen.getByLabelText(/^Email/)).toHaveAttribute(
      "placeholder",
      "vos@ejemplo.com"
    );
    expect(screen.getByLabelText(/^Contraseña/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Iniciar sesión" })
    ).toBeInTheDocument();
  });

  test.each([
    [
      { password: "123", email: VALID.email },
      "La contraseña debe tener al menos 8 caracteres",
    ],
    [{ password: VALID.password }, "Ingresá un email válido"],
  ])("refuses %j saying %j", async (values, message) => {
    const { assign, fill, submit } = setup({ locale: "es" });
    await fill(values);

    await submit();

    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(assign).not.toHaveBeenCalled();
  });

  test("signs in and reloads into the Spanish home, which has no prefix", async () => {
    const { assign, fill, submit } = setup(
      { locale: "es" },
      http.post(SIGN_IN, () =>
        HttpResponse.json({ token: "t", user: { id: "1" } })
      )
    );
    await fill(VALID);

    await submit();

    await waitFor(() => {
      expect(assign).toHaveBeenCalledExactlyOnceWith("/");
    });
  });

  test("shows the save in progress in Spanish", async () => {
    const { fill, submit } = setup(
      { locale: "es" },
      http.post(SIGN_IN, async () => await new Promise(() => {}))
    );
    await fill(VALID);

    await submit();

    expect(
      await screen.findByRole("button", { name: "Iniciando sesión…" })
    ).toBeDisabled();
  });

  test.each([
    [
      401,
      "INVALID_EMAIL_OR_PASSWORD",
      "El email o la contraseña no son correctos.",
    ],
    [
      500,
      "INTERNAL_SERVER_ERROR",
      "No pudimos iniciar la sesión. Probá de nuevo.",
    ],
  ] as const)(
    "sign-in refused with %i %s says it in Spanish",
    async (status, code, message) => {
      const { fill, submit } = setup(
        { locale: "es" },
        refuse(SIGN_IN, status, code)
      );
      await fill(VALID);

      await submit();

      expect(await screen.findByTestId("auth-error")).toHaveTextContent(
        message
      );
    }
  );

  test("says in Spanish that the server could not be reached", async () => {
    const { fill, submit } = setup(
      { locale: "es" },
      http.post(SIGN_IN, () => HttpResponse.error())
    );
    await fill(VALID);

    await submit();

    expect(await screen.findByTestId("auth-error")).toHaveTextContent(
      "No pudimos conectar con el servidor. Revisá tu conexión y probá de nuevo."
    );
  });
});
