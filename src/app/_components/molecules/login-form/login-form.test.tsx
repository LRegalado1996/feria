import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import { reportError } from "@/lib/errors/client";
import type { Locale } from "@/lib/i18n/config";
import type { LoginFormValues } from "@/lib/schemas/access";
import { renderWithI18n } from "@/test/i18n";

import { LoginForm, type LoginFormOutcome } from "./login-form";

vi.mock("@/lib/errors/client", () => ({ reportError: vi.fn() }));

function makeValues(overrides: Partial<LoginFormValues> = {}): LoginFormValues {
  return {
    email: "ana@example.com",
    name: "Ana",
    password: "synthetic-temporal-123",
    ...overrides,
  };
}

function setup({
  locale = "en",
  outcome = "saved",
}: {
  locale?: Locale;
  outcome?: LoginFormOutcome | Error;
} = {}) {
  const onSave = vi.fn(async (_values: LoginFormValues) => {
    if (outcome instanceof Error) {
      throw outcome;
    }
    return await Promise.resolve(outcome);
  });
  const onCancel = vi.fn(() => undefined);
  const user = userEvent.setup();
  renderWithI18n(<LoginForm onCancel={onCancel} onSave={onSave} />, {
    locale,
  });

  const field = (label: RegExp) => screen.getByLabelText(label);
  const fill = async (values: LoginFormValues) => {
    for (const [label, value] of [
      [/^Name/, values.name],
      [/^Email/, values.email],
      [/^Temporary password/, values.password],
    ] as const) {
      if (value !== "") {
        // Pasted whole: typing each key is slow and proves nothing more.
        await user.click(field(label));
        await user.paste(value);
      }
    }
  };
  const submit = async () => {
    await user.click(screen.getByRole("button", { name: "Create user" }));
  };

  return { field, fill, onCancel, onSave, submit, user };
}

describe("LoginForm", () => {
  test("a failed save's alert goes with the next submit, even one its validation stops", async () => {
    const { field, fill, onSave, submit, user } = setup({ outcome: "failed" });
    await fill(makeValues());
    await submit();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "We couldn't create the user. What you typed is still here: please try again."
    );

    await user.clear(field(/^Email/));
    await user.paste("ana@");
    await submit();

    await waitFor(() => {
      expect(
        screen.queryByText(
          "We couldn't create the user. What you typed is still here: please try again."
        )
      ).not.toBeInTheDocument();
    });
    expect(field(/^Email/)).toHaveAccessibleDescription("Enter a valid email.");
    expect(onSave).toHaveBeenCalledExactlyOnceWith(makeValues());
  });

  test("sends the name, the email and the temporary password, trimmed", async () => {
    const { fill, onSave, submit } = setup();
    await fill(makeValues({ email: " ana@example.com ", name: " Ana " }));

    await submit();

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledExactlyOnceWith(makeValues());
    });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  test.each([
    ["exactly eight", "12345678"],
    ["exactly 128", "x".repeat(128)],
  ] as const)("a temporary password of %s is sent", async (_case, password) => {
    const { fill, onSave, submit } = setup();
    await fill(makeValues({ password }));

    await submit();

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledExactlyOnceWith(makeValues({ password }));
    });
  });

  test.each([
    ["seven characters", "1234567", "Use at least 8 characters."],
    ["129", "x".repeat(129), "Use up to 128 characters."],
  ] as const)(
    "a temporary password of %s is refused under its field",
    async (_case, password, message) => {
      const { field, fill, onSave, submit } = setup();
      await fill(makeValues({ password }));

      await submit();

      await waitFor(() => {
        expect(field(/^Temporary password/)).toHaveAttribute(
          "aria-invalid",
          "true"
        );
      });
      expect(field(/^Temporary password/)).toHaveAccessibleDescription(
        `At least 8 characters. ${message}`
      );
      expect(onSave).not.toHaveBeenCalled();
    }
  );

  test("refuses a blank name and an email that is not one, under their fields", async () => {
    const { field, fill, onSave, submit } = setup();
    await fill(makeValues({ email: "ana@", name: "   " }));

    await submit();

    await waitFor(() => {
      expect(field(/^Name/)).toHaveAccessibleDescription("Enter the name.");
    });
    expect(field(/^Email/)).toHaveAccessibleDescription("Enter a valid email.");
    expect(onSave).not.toHaveBeenCalled();
  });

  test("an email another login has is said under the email, the rest kept", async () => {
    const { field, fill, submit } = setup({ outcome: "taken" });
    await fill(makeValues());

    await submit();

    await waitFor(() => {
      expect(field(/^Email/)).toHaveAccessibleDescription(
        "There is already a user with that email."
      );
    });
    expect(field(/^Email/)).toHaveAttribute("aria-invalid", "true");
    expect(field(/^Name/)).toHaveValue("Ana");
    expect(screen.queryByText(/couldn't create/)).not.toBeInTheDocument();
  });

  test("a failed save says so and keeps everything typed", async () => {
    const { field, fill, submit } = setup({ outcome: "failed" });
    await fill(makeValues());

    await submit();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "We couldn't create the user. What you typed is still here: please try again."
    );
    expect(field(/^Name/)).toHaveValue("Ana");
    expect(field(/^Email/)).toHaveValue("ana@example.com");
    expect(field(/^Temporary password/)).toHaveValue("synthetic-temporal-123");
    expect(screen.getByRole("button", { name: "Create user" })).toBeEnabled();
    expect(reportError).not.toHaveBeenCalled();
  });

  test("a save that throws is reported and said as a failure", async () => {
    const { fill, submit } = setup({ outcome: new Error("boom") });
    await fill(makeValues());

    await submit();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "We couldn't create the user."
    );
    expect(reportError).toHaveBeenCalledExactlyOnceWith(new Error("boom"), {
      action: "Users.create_login",
    });
  });

  test("Cancel hands back without saving", async () => {
    const { onCancel, onSave, user } = setup();

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onCancel).toHaveBeenCalledExactlyOnceWith();
    expect(onSave).not.toHaveBeenCalled();
  });

  test("speaks Spanish", () => {
    setup({ locale: "es" });

    expect(
      screen.getByRole("form", { name: "Nuevo usuario" })
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/^Nombre/)).toBeInTheDocument();
    expect(
      screen.getByLabelText(/^Contraseña temporal/)
    ).toHaveAccessibleDescription("Al menos 8 caracteres.");
    expect(
      screen.getByRole("button", { name: "Crear usuario" })
    ).toBeInTheDocument();
  });
});
