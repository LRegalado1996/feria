import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http, type RequestHandler } from "msw";
import type { ReactNode } from "react";
import { describe, expect, test, vi } from "vitest";

import { Toaster } from "@/app/_components/molecules/sonner";
import { reportError } from "@/lib/errors/client";
import type { LoginRow } from "@/lib/hooks/user";
import type { Locale } from "@/lib/i18n/config";
import { LOGIN_REFUSALS } from "@/lib/schemas/access";
import { renderWithI18n } from "@/test/i18n";
import { createOrpcErrorHandler, createOrpcHandler, server } from "@/test/msw";
import { required } from "@/test/required";

import { UserManager } from "./user-manager";

vi.mock("@/lib/orpc/client", async () => {
  const { orpcClientMock } = await import("@/test/mocks/orpc-client");
  return orpcClientMock;
});

vi.mock("@/lib/errors/client", () => ({ reportError: vi.fn() }));

const SELF_EMAIL = "ada@example.com";

function makeLogin(overrides: Partial<LoginRow> = {}): LoginRow {
  return {
    createdAt: new Date("2026-11-10T15:00:00.000Z"),
    disabledAt: null,
    email: "bea@example.com",
    id: "user-bea",
    mustChangePassword: false,
    name: "Bea Staff",
    role: "member",
    ...overrides,
  };
}

const ROWS: LoginRow[] = [
  makeLogin({ email: SELF_EMAIL, id: "user-ada", name: "Ada Admin" }),
  makeLogin({ mustChangePassword: true }),
  makeLogin({
    disabledAt: new Date("2026-11-20T15:00:00.000Z"),
    email: "caro@example.com",
    id: "user-caro",
    name: "Caro Gone",
  }),
];

/** A failure an oRPC procedure answers with. */
interface Refusal {
  code: string;
  message: string;
  status: number;
}

const PROTECTED: Refusal = {
  code: "FORBIDDEN",
  message: LOGIN_REFUSALS.protectedLogin,
  status: 403,
};

const SERVER_ERROR: Refusal = {
  code: "INTERNAL_SERVER_ERROR",
  message: "Internal server error",
  status: 500,
};

type Outcome = "hang" | "ok" | Refusal;

const WRITES = ["create", "disable", "enable", "resetPassword"] as const;

/** A procedure that records its input, then answers, fails or never answers. */
function answer(
  path: string,
  spy: (input: unknown) => unknown,
  outcome: Outcome
): RequestHandler {
  if (typeof outcome === "object") {
    return createOrpcErrorHandler(path, outcome);
  }

  return createOrpcHandler(path, async (input) => {
    const output = spy(input);
    return outcome === "hang" ? await new Promise<never>(() => {}) : output;
  });
}

function setup({
  list = [ROWS],
  locale = "en",
  writes = {},
}: {
  /** What each read of the list answers, in turn; the last one repeats. */
  list?: LoginRow[][] | "fail" | "hang";
  locale?: Locale;
  writes?: Partial<Record<(typeof WRITES)[number], Outcome>>;
} = {}) {
  let reads = 0;
  const spies = {
    create: vi.fn((input: unknown) => ({
      email: (input as { email: string }).email,
      id: "user-new",
      name: (input as { name: string }).name,
    })),
    disable: vi.fn((input: unknown) => ({
      disabledAt: new Date("2026-11-25T15:00:00.000Z"),
      id: (input as { id: string }).id,
    })),
    enable: vi.fn((input: unknown) => ({
      disabledAt: null,
      id: (input as { id: string }).id,
    })),
    list: vi.fn((_input: unknown) => {
      const answers = Array.isArray(list) ? list : [ROWS];
      const rows = answers[Math.min(reads, answers.length - 1)];
      reads += 1;
      return rows;
    }),
    resetPassword: vi.fn((input: unknown) => ({
      id: (input as { id: string }).id,
      mustChangePassword: true,
    })),
  };
  server.use(
    Array.isArray(list)
      ? createOrpcHandler("user.list", spies.list)
      : answer(
          "user.list",
          spies.list,
          list === "fail" ? SERVER_ERROR : "hang"
        ),
    ...WRITES.map((name) =>
      answer(`user.${name}`, spies[name], writes[name] ?? "ok")
    )
  );
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });

  function Providers({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        {children}
        <Toaster />
      </QueryClientProvider>
    );
  }

  const user = userEvent.setup();
  renderWithI18n(<UserManager currentEmail={SELF_EMAIL} />, {
    locale,
    wrapper: Providers,
  });
  const rows = async () => await screen.findAllByTestId("login-row");

  /** Focuses a field and pastes `value` into it: one input event, fast. */
  const enter = async (field: HTMLElement, value: string) => {
    await user.click(field);
    await user.paste(value);
  };

  /** Opens "New user" and fills its three fields. */
  const fillNewLogin = async () => {
    await rows();
    await user.click(screen.getByTestId("login-add"));
    const sheet = await screen.findByTestId("login-sheet");
    await enter(within(sheet).getByRole("textbox", { name: /^Name/u }), "Dani");
    await enter(
      within(sheet).getByRole("textbox", { name: /^Email/u }),
      "dani@example.com"
    );
    await enter(
      within(sheet).getByLabelText(/^Temporary password/u),
      "synthetic-temporary-123"
    );
    return sheet;
  };

  /** Asks to disable Bea and confirms. */
  const disableBea = async () => {
    const [, bea] = await rows();
    await user.click(
      within(required(bea)).getByRole("button", { name: "Disable: Bea Staff" })
    );
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Disable" }));
    return dialog;
  };

  /** Opens Bea's reset and types a password. */
  const fillReset = async () => {
    const [, bea] = await rows();
    const button = within(required(bea)).getByRole("button", {
      name: "Reset password: Bea Staff",
    });
    await user.click(button);
    const sheet = await screen.findByTestId("login-sheet");
    await enter(
      within(sheet).getByLabelText(/^Temporary password/u),
      "new-temporary-1"
    );
    return { button, sheet };
  };

  return {
    disableBea,
    fillNewLogin,
    fillReset,
    queryClient,
    rows,
    spies,
    user,
  };
}

describe("UserManager", () => {
  test("the superadmin's row offers nothing to another admin and says why", async () => {
    const { rows } = setup({
      list: [
        [
          makeLogin({ email: SELF_EMAIL, id: "user-ada", name: "Ada Admin" }),
          makeLogin({ role: "superadmin" }),
        ],
      ],
    });

    const [, owner] = await rows();

    expect(
      within(required(owner)).getByTestId("login-superadmin")
    ).toHaveTextContent("Superadmin");
    expect(
      within(required(owner)).getByTestId("login-protected")
    ).toHaveTextContent(
      "This is the superadmin: nobody else can disable it or change its password."
    );
    expect(within(required(owner)).queryAllByRole("button")).toEqual([]);
  });

  test("the superadmin's own row marks it, and says only why it offers nothing to itself", async () => {
    const { rows } = setup({
      list: [
        [
          makeLogin({
            email: SELF_EMAIL,
            id: "user-ada",
            name: "Ada Admin",
            role: "superadmin",
          }),
        ],
      ],
    });

    const [own] = await rows();

    expect(
      within(required(own)).getByTestId("login-superadmin")
    ).toHaveTextContent("Superadmin");
    expect(within(required(own)).queryByTestId("login-protected")).toBeNull();
    expect(within(required(own)).queryAllByRole("button")).toEqual([]);
  });

  test("lists each login with its status, since when and its actions; the signed-in one offers none", async () => {
    const { rows } = setup();

    const [ada, bea, caro] = (await rows()).map(required);

    expect(within(required(ada)).getByTestId("login-name")).toHaveTextContent(
      "Ada Admin"
    );
    expect(ada).toHaveTextContent("You");
    expect(ada).toHaveTextContent(
      "This is your user: you can't disable it, and you change your password from “Change password”."
    );
    expect(within(required(ada)).queryAllByRole("button")).toEqual([]);
    expect(within(required(ada)).getByTestId("login-status")).toHaveTextContent(
      "Active"
    );
    expect(within(required(ada)).getByTestId("login-since")).toHaveTextContent(
      "Since November 10, 2026"
    );
    expect(within(required(ada)).queryByTestId("login-temporary")).toBeNull();

    expect(bea).toHaveAttribute("data-disabled", "false");
    expect(bea).not.toHaveTextContent("You");
    expect(
      within(required(bea)).getByTestId("login-temporary")
    ).toHaveTextContent("Temporary password");
    expect(
      within(required(bea))
        .getAllByRole("button")
        .map((button) => button.getAttribute("aria-label"))
    ).toEqual(["Reset password: Bea Staff", "Disable: Bea Staff"]);

    expect(caro).toHaveAttribute("data-disabled", "true");
    expect(
      within(required(caro)).getByTestId("login-status")
    ).toHaveTextContent("Disabled");
    expect(within(required(caro)).getByTestId("login-since")).toHaveTextContent(
      "Disabled on November 20, 2026"
    );
    expect(
      within(required(caro))
        .getAllByRole("button")
        .map((button) => button.getAttribute("aria-label"))
    ).toEqual(["Reset password: Caro Gone", "Enable: Caro Gone"]);
  });

  test("in Spanish, says it all in Spanish", async () => {
    const { rows } = setup({ locale: "es" });

    const [ada, bea, caro] = (await rows()).map(required);

    expect(ada).toHaveTextContent("Vos");
    expect(within(required(ada)).getByTestId("login-since")).toHaveTextContent(
      "Desde el 10 de noviembre de 2026"
    );
    expect(within(required(bea)).getByTestId("login-status")).toHaveTextContent(
      "Activo"
    );
    expect(
      within(required(bea)).getByRole("button", {
        name: "Deshabilitar: Bea Staff",
      })
    ).toBeInTheDocument();
    expect(within(required(caro)).getByTestId("login-since")).toHaveTextContent(
      "Deshabilitado el 20 de noviembre de 2026"
    );
    expect(screen.getByTestId("login-add")).toHaveTextContent("Nuevo usuario");
  });

  test("waits on a skeleton, then says a failed load and loads again on retry", async () => {
    const { spies, user } = setup({ list: "fail" });

    expect(screen.getByTestId("user-manager-skeleton")).toHaveAttribute(
      "aria-busy",
      "true"
    );
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("We couldn't load the users.");

    server.use(createOrpcHandler("user.list", spies.list));
    await user.click(within(alert).getByRole("button", { name: "Try again" }));

    const recovered = await screen.findAllByTestId("login-row");
    expect(
      recovered.map((row) => within(row).getByTestId("login-name").textContent)
    ).toEqual(["Ada Admin", "Bea Staff", "Caro Gone"]);
    expect(spies.list).toHaveBeenCalledExactlyOnceWith(undefined);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  test("creates a login from the side sheet, then shows once what to send", async () => {
    const { fillNewLogin, spies, user } = setup();

    const sheet = await fillNewLogin();
    await user.click(within(sheet).getByTestId("login-form-submit"));

    expect(await within(sheet).findByText("User created")).toBeInTheDocument();
    expect(spies.create).toHaveBeenCalledExactlyOnceWith({
      email: "dani@example.com",
      name: "Dani",
      password: "synthetic-temporary-123",
    });
    expect(
      within(sheet).getByTestId("login-credentials-email")
    ).toHaveTextContent("dani@example.com");
    expect(
      within(sheet).getByTestId("login-credentials-password")
    ).toHaveTextContent("synthetic-temporary-123");
    // The list is read again for the new row.
    await waitFor(() => {
      expect(spies.list.mock.calls).toEqual([[undefined], [undefined]]);
    });

    await user.click(within(sheet).getByRole("button", { name: "Done" }));
    await waitFor(() => {
      expect(screen.queryByTestId("login-sheet")).toBeNull();
    });
    await waitFor(() => {
      expect(screen.getByTestId("login-add")).toHaveFocus();
    });
  });

  test("an email another login has stays in the sheet, said under the email, reported to no one", async () => {
    const { fillNewLogin, user } = setup({
      writes: {
        create: {
          code: "CONFLICT",
          message: "An account with that email already exists",
          status: 409,
        },
      },
    });

    const sheet = await fillNewLogin();
    await user.click(within(sheet).getByTestId("login-form-submit"));

    expect(
      await within(sheet).findByText("There is already a user with that email.")
    ).toBeInTheDocument();
    expect(within(sheet).queryByTestId("login-credentials")).toBeNull();
    expect(reportError).not.toHaveBeenCalled();
  });

  test("a failed creation is reported and said in the sheet, keeping what was typed", async () => {
    const { fillNewLogin, user } = setup({ writes: { create: SERVER_ERROR } });

    const sheet = await fillNewLogin();
    await user.click(within(sheet).getByTestId("login-form-submit"));

    expect(await within(sheet).findByRole("alert")).toHaveTextContent(
      "We couldn't create the user. What you typed is still here: please try again."
    );
    expect(within(sheet).getByRole("textbox", { name: /^Email/u })).toHaveValue(
      "dani@example.com"
    );
    expect(reportError).toHaveBeenCalledExactlyOnceWith(expect.anything(), {
      action: "Users.create_login",
    });
  });

  test("a creation that ends after its sheet was closed leaves the list as it is", async () => {
    let release: (value: unknown) => void = () => undefined;
    const held = new Promise((resolve) => {
      release = resolve;
    });
    const { fillNewLogin, queryClient, user } = setup();
    server.use(
      createOrpcHandler("user.create", async () => {
        await held;
        return { email: "dani@example.com", id: "user-new", name: "Dani" };
      })
    );

    try {
      const sheet = await fillNewLogin();
      await user.click(within(sheet).getByTestId("login-form-submit"));
      await user.click(within(sheet).getByRole("button", { name: "Close" }));
      await waitFor(() => {
        expect(screen.queryByTestId("login-sheet")).toBeNull();
      });
      release(undefined);

      // Once the creation settled and the code after it ran, no summary
      // reopened the sheet.
      await waitFor(() => {
        expect(
          queryClient
            .getMutationCache()
            .getAll()
            .map((mutation) => mutation.state.status)
        ).toEqual(["success"]);
      });
      await act(async () => {
        await Promise.resolve();
      });
      expect(screen.queryByTestId("login-sheet")).toBeNull();
    } finally {
      release(undefined);
    }
  });

  test("resets another login's password, then shows once what to send", async () => {
    const { fillReset, spies, user } = setup();

    const { button, sheet } = await fillReset();
    expect(sheet).toHaveTextContent(
      "Type a new temporary password for Bea Staff."
    );
    await user.click(within(sheet).getByTestId("reset-password-submit"));

    expect(
      await within(sheet).findByText("Password reset")
    ).toBeInTheDocument();
    expect(spies.resetPassword).toHaveBeenCalledExactlyOnceWith({
      id: "user-bea",
      password: "new-temporary-1",
    });
    expect(
      within(sheet).getByTestId("login-credentials-email")
    ).toHaveTextContent("bea@example.com");
    expect(
      within(sheet).getByTestId("login-credentials-password")
    ).toHaveTextContent("new-temporary-1");

    await user.click(within(sheet).getByRole("button", { name: "Done" }));
    await waitFor(() => {
      expect(button).toHaveFocus();
    });
  });

  test.each([
    [
      "a login gone",
      { code: "NOT_FOUND", message: "Login not found", status: 404 },
      "That user no longer exists. We reloaded the list.",
    ],
    [
      "the superadmin's login",
      PROTECTED,
      "The superadmin can't be changed from another user.",
    ],
  ])(
    "a reset of %s closes the sheet and says so, reported to no one",
    async (_case, refusal, said) => {
      const { fillReset, user } = setup({
        writes: { resetPassword: refusal },
      });

      const { sheet } = await fillReset();
      await user.click(within(sheet).getByTestId("reset-password-submit"));

      expect(await screen.findByText(said)).toBeInTheDocument();
      await waitFor(() => {
        expect(screen.queryByTestId("login-sheet")).toBeNull();
      });
      expect(reportError).not.toHaveBeenCalled();
    }
  );

  test("a failed reset is reported and said in the sheet, keeping the password typed", async () => {
    const { fillReset, user } = setup({
      writes: { resetPassword: SERVER_ERROR },
    });

    const { sheet } = await fillReset();
    await user.click(within(sheet).getByTestId("reset-password-submit"));

    expect(await within(sheet).findByRole("alert")).toHaveTextContent(
      "We couldn't save the password. What you typed is still here: please try again."
    );
    expect(within(sheet).getByLabelText(/^Temporary password/u)).toHaveValue(
      "new-temporary-1"
    );
    expect(within(sheet).queryByTestId("login-credentials")).toBeNull();
    expect(reportError).toHaveBeenCalledExactlyOnceWith(expect.anything(), {
      action: "Users.reset_password",
    });
  });

  test("cancelling a reset sends nothing and hands focus back to its button", async () => {
    const { fillReset, spies, user } = setup();

    const { button, sheet } = await fillReset();
    await user.click(within(sheet).getByRole("button", { name: "Cancel" }));

    await waitFor(() => {
      expect(button).toHaveFocus();
    });
    expect(spies.resetPassword).not.toHaveBeenCalled();
  });

  test("disables a login after asking, then says so", async () => {
    const { rows, spies, user } = setup();
    const [, bea] = await rows();

    await user.click(
      within(required(bea)).getByRole("button", { name: "Disable: Bea Staff" })
    );
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Disable Bea Staff?");
    expect(dialog).toHaveTextContent(
      "Their sessions are signed out and they can't sign in until someone enables them. Nothing is deleted."
    );
    await user.click(within(dialog).getByRole("button", { name: "Disable" }));

    expect(
      await screen.findByText("Bea Staff is disabled.")
    ).toBeInTheDocument();
    expect(spies.disable).toHaveBeenCalledExactlyOnceWith({ id: "user-bea" });
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
  });

  test("focus goes to “New user” once the disabled login's row is gone from the list read again", async () => {
    const [ada, , caro] = ROWS;
    const { disableBea } = setup({
      list: [ROWS, [required(ada), required(caro)]],
    });

    await disableBea();

    await waitFor(() => {
      expect(screen.getByTestId("login-add")).toHaveFocus();
    });
    expect(
      screen.getAllByTestId("login-name").map((name) => name.textContent)
    ).toEqual(["Ada Admin", "Caro Gone"]);
  });

  test.each([
    [
      "the last enabled login",
      {
        code: "CONFLICT",
        message: LOGIN_REFUSALS.lastEnabledLogin,
        status: 409,
      },
      "This is the only active user: the store would be left with nobody who can sign in.",
    ],
    [
      "the admin's own login",
      {
        code: "FORBIDDEN",
        message: LOGIN_REFUSALS.ownLoginDisabled,
        status: 403,
      },
      "You can't disable your own user.",
    ],
    [
      "a login gone",
      { code: "NOT_FOUND", message: "Login not found", status: 404 },
      "That user no longer exists. We reloaded the list.",
    ],
    [
      "the superadmin's login",
      PROTECTED,
      "The superadmin can't be changed from another user.",
    ],
  ])(
    "a refusal to disable %s is said in its own words and reported to no one",
    async (_case, refusal, said) => {
      const { disableBea } = setup({ writes: { disable: refusal } });

      await disableBea();

      expect(await screen.findByText(said)).toBeInTheDocument();
      expect(reportError).not.toHaveBeenCalled();
      await waitFor(() => {
        expect(screen.queryByRole("dialog")).toBeNull();
      });
    }
  );

  test.each([
    [
      "any other conflict",
      { code: "CONFLICT", message: "Something else", status: 409 },
    ],
    ["a server failure", SERVER_ERROR],
  ])("%s while disabling is reported and said", async (_case, refusal) => {
    const { disableBea } = setup({ writes: { disable: refusal } });

    await disableBea();

    expect(
      await screen.findByText("We couldn't disable the user. Please try again.")
    ).toBeInTheDocument();
    expect(reportError).toHaveBeenCalledExactlyOnceWith(expect.anything(), {
      action: "Users.disable_login",
    });
  });

  test("a connection lost while disabling is reported and said", async () => {
    const { disableBea } = setup();
    server.use(
      http.post("*/api/orpc/user/disable", () => HttpResponse.error())
    );

    await disableBea();

    expect(
      await screen.findByText("We couldn't disable the user. Please try again.")
    ).toBeInTheDocument();
    expect(reportError).toHaveBeenCalledExactlyOnceWith(expect.any(TypeError), {
      action: "Users.disable_login",
    });
  });

  test("dismissing the question disables nothing and hands focus back to its button", async () => {
    const { rows, spies, user } = setup();
    const [, bea] = await rows();
    const button = within(required(bea)).getByRole("button", {
      name: "Disable: Bea Staff",
    });

    await user.click(button);
    await screen.findByRole("dialog");
    await user.keyboard("{Escape}");

    await waitFor(() => {
      expect(button).toHaveFocus();
    });
    expect(spies.disable).not.toHaveBeenCalled();
  });

  test("enables a disabled login at once, then says so", async () => {
    const { rows, spies, user } = setup();
    const caro = (await rows())[2];

    await user.click(
      within(required(caro)).getByRole("button", { name: "Enable: Caro Gone" })
    );

    expect(
      await screen.findByText("Caro Gone can sign in again.")
    ).toBeInTheDocument();
    expect(spies.enable).toHaveBeenCalledExactlyOnceWith({ id: "user-caro" });
  });

  test("a second press while enabling is dropped, the button marked busy", async () => {
    const { rows, spies, user } = setup({ writes: { enable: "hang" } });
    const caro = (await rows())[2];
    const button = within(required(caro)).getByRole("button", {
      name: "Enable: Caro Gone",
    });

    await user.click(button);
    await waitFor(() => {
      expect(button).toHaveAttribute("aria-disabled", "true");
    });
    await user.click(button);

    expect(spies.enable).toHaveBeenCalledExactlyOnceWith({ id: "user-caro" });
    expect(button).toHaveFocus();
  });

  test.each([
    [
      "a login gone",
      { code: "NOT_FOUND", message: "Login not found", status: 404 },
      "That user no longer exists. We reloaded the list.",
    ],
    [
      "the superadmin's login",
      PROTECTED,
      "The superadmin can't be changed from another user.",
    ],
  ])(
    "enabling %s says so, reported to no one",
    async (_case, refusal, said) => {
      const { rows, user } = setup({ writes: { enable: refusal } });
      const caro = (await rows())[2];

      await user.click(
        within(required(caro)).getByRole("button", {
          name: "Enable: Caro Gone",
        })
      );

      expect(await screen.findByText(said)).toBeInTheDocument();
      expect(reportError).not.toHaveBeenCalled();
    }
  );

  test("a failed enable is reported and said", async () => {
    const { rows, user } = setup({ writes: { enable: SERVER_ERROR } });
    const caro = (await rows())[2];

    await user.click(
      within(required(caro)).getByRole("button", { name: "Enable: Caro Gone" })
    );

    expect(
      await screen.findByText("We couldn't enable the user. Please try again.")
    ).toBeInTheDocument();
    expect(reportError).toHaveBeenCalledExactlyOnceWith(expect.anything(), {
      action: "Users.enable_login",
    });
  });
});
