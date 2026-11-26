import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import { reportError } from "@/lib/errors/client";
import type { Locale } from "@/lib/i18n/config";
import { LOGIN_REFUSALS } from "@/lib/schemas/access";
import { renderWithI18n } from "@/test/i18n";
import { createOrpcErrorHandler, createOrpcHandler, server } from "@/test/msw";
import { createQueryWrapper } from "@/test/setup-helpers";

import { ChangePasswordForm } from "./change-password-form";

vi.mock("@/lib/errors/client", () => ({ reportError: vi.fn() }));

vi.mock("@/lib/orpc/client", async () => {
  const { orpcClientMock } = await import("@/test/mocks/orpc-client");
  return orpcClientMock;
});

const LABELS = {
  en: {
    confirm: /^Repeat the new password/,
    current: /^Current password/,
    new: /^New password/,
    submit: "Save password",
    temporary: /^Temporary password/,
  },
  es: {
    confirm: /^Repetí la contraseña nueva/,
    current: /^Contraseña actual/,
    new: /^Contraseña nueva/,
    submit: "Guardar contraseña",
    temporary: /^Contraseña temporal/,
  },
} as const;

/** What the server answers for each way the change can fail. */
const REFUSALS = {
  failed: () => ({
    code: "INTERNAL_SERVER_ERROR",
    message: "Internal server error",
    status: 500,
  }),
  limited: (retryAfter: number | null) => ({
    code: "TOO_MANY_REQUESTS",
    data: retryAfter === null ? undefined : { retryAfter },
    message: LOGIN_REFUSALS.tooManyPasswordAttempts,
    status: 429,
  }),
  wrong: () => ({
    code: "BAD_REQUEST",
    message: "The current password is not correct",
    status: 400,
  }),
};

/**
 * `answer`: how the server answers the change: saved, a wrong current
 * password, too many wrong ones (waiting `retryAfter` seconds, or saying
 * nothing of it), or another failure.
 */
function setup({
  answer = "saved",
  forced = false,
  locale = "en",
  retryAfter = 840,
}: {
  answer?: "failed" | "limited" | "saved" | "wrong";
  forced?: boolean;
  locale?: Locale;
  retryAfter?: number | null;
} = {}) {
  const labels = LABELS[locale];
  const change = vi.fn((_input: unknown) => ({
    id: "login-1",
    mustChangePassword: false,
  }));
  server.use(
    answer === "saved"
      ? createOrpcHandler("admin.changePassword", change)
      : createOrpcErrorHandler(
          "admin.changePassword",
          REFUSALS[answer](retryAfter)
        )
  );
  const assign = vi
    .spyOn(window.location, "assign")
    .mockImplementation(() => undefined);
  const user = userEvent.setup();
  renderWithI18n(
    <ChangePasswordForm forced={forced} redirectTo="/en/admin/users" />,
    { locale, wrapper: createQueryWrapper() }
  );
  const current = () =>
    screen.getByLabelText(forced ? labels.temporary : labels.current);

  return {
    assign,
    change,
    confirm: () => screen.getByLabelText(labels.confirm),
    current,
    fresh: () => screen.getByLabelText(labels.new),
    save: async (values: {
      confirmPassword: string;
      currentPassword: string;
      newPassword: string;
    }) => {
      for (const [field, value] of [
        [current(), values.currentPassword],
        [screen.getByLabelText(labels.new), values.newPassword],
        [screen.getByLabelText(labels.confirm), values.confirmPassword],
      ] as const) {
        await user.click(field);
        await user.paste(value);
      }
      await user.click(screen.getByRole("button", { name: labels.submit }));
    },
  };
}

const VALUES = {
  confirmPassword: "mi-propia-456",
  currentPassword: "temporal-123",
  newPassword: "mi-propia-456",
};

describe("ChangePasswordForm", () => {
  test("sends the current and the new password, never the repeat, then reloads where the page said", async () => {
    const { assign, change, save } = setup();

    await save(VALUES);

    await waitFor(() => {
      expect(assign).toHaveBeenCalledExactlyOnceWith("/en/admin/users");
    });
    expect(change).toHaveBeenCalledExactlyOnceWith({
      currentPassword: "temporal-123",
      newPassword: "mi-propia-456",
    });
    expect(reportError).not.toHaveBeenCalled();
  });

  test("refuses a repeat that does not match, under it", async () => {
    const { assign, change, confirm, save } = setup();

    await save({ ...VALUES, confirmPassword: "mi-propia-457" });

    await waitFor(() => {
      expect(confirm()).toHaveAccessibleDescription(
        "The two passwords don't match."
      );
    });
    expect(change).not.toHaveBeenCalled();
    expect(assign).not.toHaveBeenCalled();
  });

  test("refuses a new password equal to the current one, under it", async () => {
    const { change, fresh, save } = setup();

    await save({
      confirmPassword: "temporal-123",
      currentPassword: "temporal-123",
      newPassword: "temporal-123",
    });

    await waitFor(() => {
      expect(fresh()).toHaveAccessibleDescription(
        "At least 8 characters, different from the current one. It must be different from the current one."
      );
    });
    expect(change).not.toHaveBeenCalled();
  });

  test("a new password of exactly eight characters is sent", async () => {
    const { change, save } = setup();

    await save({
      ...VALUES,
      confirmPassword: "12345678",
      newPassword: "12345678",
    });

    await waitFor(() => {
      expect(change).toHaveBeenCalledExactlyOnceWith({
        currentPassword: "temporal-123",
        newPassword: "12345678",
      });
    });
  });

  test("a new password of seven characters is refused under its field", async () => {
    const { change, fresh, save } = setup();

    await save({
      ...VALUES,
      confirmPassword: "1234567",
      newPassword: "1234567",
    });

    await waitFor(() => {
      expect(fresh()).toHaveAccessibleDescription(
        "At least 8 characters, different from the current one. Use at least 8 characters."
      );
    });
    expect(change).not.toHaveBeenCalled();
  });

  test.each([
    [false, "The current password is not correct."],
    [true, "The temporary password is not correct."],
  ] as const)(
    "forced %s: a wrong current password is said under its field, unreported",
    async (forced, message) => {
      const { assign, current, save } = setup({ answer: "wrong", forced });

      await save(VALUES);

      await waitFor(() => {
        expect(current()).toHaveAccessibleDescription(message);
      });
      expect(current()).toHaveAttribute("aria-invalid", "true");
      expect(assign).not.toHaveBeenCalled();
      expect(reportError).not.toHaveBeenCalled();
      expect(
        screen.queryByText("We couldn't save the password. Please try again.")
      ).not.toBeInTheDocument();
    }
  );

  test.each([
    [840, "14"],
    [60, "1"],
    [61, "2"],
    [30, "1"],
    [null, "15"],
  ] as const)(
    "too many wrong passwords, waiting %j seconds, says to come back in %s min, unreported and keeping what was typed",
    async (retryAfter, minutes) => {
      const { assign, current, save } = setup({
        answer: "limited",
        retryAfter,
      });

      await save(VALUES);

      await waitFor(() => {
        expect(
          screen.getByText(
            `Too many tries with a wrong password. Try again in ${minutes} min.`
          )
        ).toHaveAttribute("role", "alert");
      });
      expect(reportError).not.toHaveBeenCalled();
      expect(current()).toHaveValue("temporal-123");
      expect(assign).not.toHaveBeenCalled();
    }
  );

  test("another failure is reported and said, everything typed kept", async () => {
    const { assign, current, fresh, save } = setup({ answer: "failed" });

    await save(VALUES);

    await waitFor(() => {
      expect(
        screen.getByText("We couldn't save the password. Please try again.")
      ).toHaveAttribute("role", "alert");
    });
    expect(reportError).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        code: "INTERNAL_SERVER_ERROR",
        message: "Internal server error",
      }),
      { action: "Account.change_password" }
    );
    expect(current()).toHaveValue("temporal-123");
    expect(fresh()).toHaveValue("mi-propia-456");
    expect(assign).not.toHaveBeenCalled();
  });

  test("speaks Spanish, the forced wording too", async () => {
    const { current, save } = setup({
      answer: "wrong",
      forced: true,
      locale: "es",
    });

    await save(VALUES);

    await waitFor(() => {
      expect(current()).toHaveAccessibleDescription(
        "La contraseña temporal no es correcta."
      );
    });
    expect(
      screen.getByLabelText(/^Contraseña nueva/)
    ).toHaveAccessibleDescription(
      "Al menos 8 caracteres, distinta de la actual."
    );
  });
});
