import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import { reportError } from "@/lib/errors/client";
import type { Locale } from "@/lib/i18n/config";
import { renderWithI18n } from "@/test/i18n";

import { ResetPasswordForm } from "./reset-password-form";

vi.mock("@/lib/errors/client", () => ({ reportError: vi.fn() }));

function setup({
  locale = "en",
  saved = true,
}: { locale?: Locale; saved?: boolean | Error } = {}) {
  const onSave = vi.fn(async (_values: { password: string }) => {
    if (saved instanceof Error) {
      throw saved;
    }
    return await Promise.resolve(saved);
  });
  const onCancel = vi.fn(() => undefined);
  const user = userEvent.setup();
  renderWithI18n(<ResetPasswordForm onCancel={onCancel} onSave={onSave} />, {
    locale,
  });
  const field = () => screen.getByLabelText(/^Temporary password/);

  return {
    field,
    onCancel,
    onSave,
    save: async (password: string) => {
      await user.click(field());
      await user.paste(password);
      await user.click(screen.getByRole("button", { name: "Save password" }));
    },
    user,
  };
}

describe("ResetPasswordForm", () => {
  test.each([["12345678"], ["x".repeat(128)]] as const)(
    "a password %s long is sent",
    async (password) => {
      const { onSave, save } = setup();

      await save(password);

      await waitFor(() => {
        expect(onSave).toHaveBeenCalledExactlyOnceWith({ password });
      });
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    }
  );

  test.each([
    ["1234567", "Use at least 8 characters."],
    ["x".repeat(129), "Use up to 128 characters."],
  ] as const)(
    "a password %s long is refused under its field",
    async (password, message) => {
      const { field, onSave, save } = setup();

      await save(password);

      await waitFor(() => {
        expect(field()).toHaveAccessibleDescription(
          `At least 8 characters. ${message}`
        );
      });
      expect(onSave).not.toHaveBeenCalled();
    }
  );

  test("a failed save says so and keeps the password typed", async () => {
    const { field, save } = setup({ saved: false });

    await save("otra-temporal-9");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "We couldn't save the password. What you typed is still here: please try again."
    );
    expect(field()).toHaveValue("otra-temporal-9");
    expect(reportError).not.toHaveBeenCalled();
  });

  test("a save that throws is reported and said as a failure", async () => {
    const { save } = setup({ saved: new Error("boom") });

    await save("otra-temporal-9");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "We couldn't save the password."
    );
    expect(reportError).toHaveBeenCalledExactlyOnceWith(new Error("boom"), {
      action: "Users.reset_password",
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
      screen.getByRole("form", { name: "Restablecer contraseña" })
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/^Contraseña temporal/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Guardar contraseña" })
    ).toBeInTheDocument();
  });
});
