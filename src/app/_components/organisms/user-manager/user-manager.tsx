"use client";

import { ORPCError } from "@orpc/client";
import { KeyRound, Plus, UserCheck, UserX } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/app/_components/atoms/button";
import { Skeleton } from "@/app/_components/atoms/skeleton";
import { AdminPage } from "@/app/_components/molecules/admin-page";
import { ConfirmDialog } from "@/app/_components/molecules/confirm-dialog";
import { LoginCredentials } from "@/app/_components/molecules/login-credentials";
import {
  LoginForm,
  type LoginFormOutcome,
} from "@/app/_components/molecules/login-form";
import { ResetPasswordForm } from "@/app/_components/molecules/reset-password-form";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/app/_components/molecules/sheet";
import type { Dictionary } from "@/content";
import { ADMIN_SIGN_IN } from "@/lib/admin/paths";
import { reportError } from "@/lib/errors/client";
import { useDictionary, useLocale } from "@/lib/hooks/i18n";
import {
  type LoginRow,
  useCreateLogin,
  useDisableLogin,
  useEnableLogin,
  useLogins,
  useResetLoginPassword,
} from "@/lib/hooks/user";
import type { Locale } from "@/lib/i18n/config";
import { interpolate } from "@/lib/i18n/interpolate";
import { localizePath } from "@/lib/i18n/paths";
import { LOGIN_REFUSALS, type LoginFormValues } from "@/lib/schemas/access";
import { formatDate } from "@/lib/utils/format";

const CHIP = "rounded-full px-2 py-0.5";
const CHIP_ON =
  "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300";
const CHIP_WARN =
  "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300";
const CHIP_OFF = "bg-muted text-muted-foreground";

type UsersCopy = Dictionary["admin"]["users"];

/** What the side sheet shows; each opening is its own object. */
type SheetState =
  | { kind: "create" }
  | { email: string; kind: "created"; name: string; password: string }
  | { kind: "reset"; login: LoginRow }
  | { kind: "reset-done"; login: LoginRow; password: string };

/** Whether the server refused to touch the superadmin's login. */
function isProtectedRefusal(error: unknown): boolean {
  return (
    error instanceof ORPCError &&
    error.code === "FORBIDDEN" &&
    error.message === LOGIN_REFUSALS.protectedLogin
  );
}

/** Why disabling a login was refused, in the screen's words. */
function disableRefusal(error: unknown, copy: UsersCopy): string | null {
  if (!(error instanceof ORPCError)) {
    return null;
  }

  if (isProtectedRefusal(error)) {
    return copy.errors.protected;
  }

  if (
    error.code === "CONFLICT" &&
    error.message === LOGIN_REFUSALS.lastEnabledLogin
  ) {
    return copy.errors.lastEnabled;
  }

  if (
    error.code === "FORBIDDEN" &&
    error.message === LOGIN_REFUSALS.ownLoginDisabled
  ) {
    return copy.errors.ownDisabled;
  }

  return error.code === "NOT_FOUND" ? copy.errors.notFound : null;
}

/**
 * One login of the list: its name and email, its status (active, disabled,
 * on a temporary password), since when, and what can be done with it, each
 * button named with the login. The signed-in login's own row offers
 * nothing and says why: nobody disables or resets themselves. Nor does the
 * superadmin's (Lucas, 2026-11-25): no other login may change it, which
 * the server enforces too.
 */
function LoginItem({
  isSelf,
  locale,
  login,
  onDisable,
  onEnable,
  onReset,
  enabling,
}: {
  enabling: boolean;
  isSelf: boolean;
  locale: Locale;
  login: LoginRow;
  onDisable: (opener: HTMLButtonElement) => void;
  onEnable: () => void;
  onReset: (opener: HTMLButtonElement) => void;
}) {
  const copy = useDictionary().admin.users;
  const disabled = login.disabledAt !== null;
  const isProtected = login.role === "superadmin";
  const name = login.name;

  return (
    <li
      className="flex min-w-0 flex-col gap-3 py-3 first:pt-0 last:pb-0 md:flex-row md:items-center"
      data-disabled={disabled}
      data-testid="login-row"
    >
      <div className="min-w-0 flex-1 space-y-1">
        <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
          <span className="truncate" data-testid="login-name">
            {name}
          </span>
          {isSelf ? (
            <span className={`${CHIP} ${CHIP_OFF} text-xs font-normal`}>
              {copy.you}
            </span>
          ) : null}
          {isProtected ? (
            <span
              className={`${CHIP} ${CHIP_OFF} text-xs font-normal`}
              data-testid="login-superadmin"
            >
              {copy.status.superadmin}
            </span>
          ) : null}
        </p>
        <p className="truncate text-xs text-muted-foreground">{login.email}</p>
        <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span
            className={`${CHIP} ${disabled ? CHIP_OFF : CHIP_ON}`}
            data-testid="login-status"
          >
            {disabled ? copy.status.disabled : copy.status.active}
          </span>
          {login.mustChangePassword ? (
            <span
              className={`${CHIP} ${CHIP_WARN}`}
              data-testid="login-temporary"
            >
              {copy.status.temporary}
            </span>
          ) : null}
          {/* `new Date`: the client cache may hold a date as its ISO text. */}
          <span data-testid="login-since">
            {login.disabledAt
              ? interpolate(copy.disabledOn, {
                  date: formatDate(new Date(login.disabledAt), locale),
                })
              : interpolate(copy.createdOn, {
                  date: formatDate(new Date(login.createdAt), locale),
                })}
          </span>
        </p>
        {isSelf ? (
          <p className="text-xs text-muted-foreground">{copy.ownLogin}</p>
        ) : null}
        {isProtected && !isSelf ? (
          <p
            className="text-xs text-muted-foreground"
            data-testid="login-protected"
          >
            {copy.protectedLogin}
          </p>
        ) : null}
      </div>
      {isSelf || isProtected ? null : (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button
            aria-label={interpolate(copy.resetNamed, { name })}
            onClick={(event) => {
              onReset(event.currentTarget);
            }}
            size="sm"
            type="button"
            variant="outline"
          >
            <KeyRound aria-hidden="true" />
            {copy.resetPassword}
          </Button>
          {disabled ? (
            <Button
              aria-disabled={enabling || undefined}
              aria-label={interpolate(copy.enableNamed, { name })}
              onClick={() => {
                // Pending, `onEnable` drops the press; `aria-disabled`
                // keeps the button focusable.
                onEnable();
              }}
              size="sm"
              type="button"
              variant="outline"
            >
              <UserCheck aria-hidden="true" />
              {copy.enable}
            </Button>
          ) : (
            <Button
              aria-label={interpolate(copy.disableNamed, { name })}
              onClick={(event) => {
                onDisable(event.currentTarget);
              }}
              size="sm"
              type="button"
              variant="outline"
            >
              <UserX aria-hidden="true" />
              {copy.disable}
            </Button>
          )}
        </div>
      )}
    </li>
  );
}

export interface UserManagerProps {
  /** The signed-in login's email, which marks its own row. */
  currentEmail: string;
}

/**
 * The store's logins (FER-015) in the admin's shell and cards. "Nuevo
 * usuario" opens a side sheet with the name, the email and a temporary
 * password the admin types; once created, the sheet shows what to send,
 * once. Each other login can get a new temporary password (the same
 * one-time summary follows), be disabled (asked first: its sessions end) or
 * be enabled again. Each change says how it ended, and focus goes back to
 * what opened it, or to "Nuevo usuario" once that is gone.
 */
function UserManager({ currentEmail }: UserManagerProps) {
  const { admin, common } = useDictionary();
  const copy = admin.users;
  const locale = useLocale();
  const logins = useLogins();
  const createLogin = useCreateLogin();
  const resetPassword = useResetLoginPassword();
  const disableLogin = useDisableLogin();
  const enableLogin = useEnableLogin();
  // The sheet open now, by identity: a request that ends after its sheet
  // was closed, or another one opened, leaves the open one alone.
  const [sheet, setSheet] = useState<SheetState | null>(null);
  const openSheet = useRef<SheetState | null>(null);
  const [disabling, setDisabling] = useState<{ login: LoginRow } | null>(null);
  // The logins whose enabling is on its way, each on its own.
  const [enablingIds, setEnablingIds] = useState<ReadonlySet<string>>(
    () => new Set()
  );
  const enablingNow = useRef(new Set<string>());
  const opener = useRef<HTMLButtonElement | null>(null);
  const addButton = useRef<HTMLButtonElement>(null);
  const signInPath = localizePath(ADMIN_SIGN_IN, locale);

  const show = (next: SheetState | null) => {
    openSheet.current = next;
    setSheet(next);
  };

  const create = async (values: LoginFormValues): Promise<LoginFormOutcome> => {
    const asked = openSheet.current;

    try {
      const created = await createLogin.mutateAsync(values);

      if (openSheet.current === asked) {
        show({
          email: created.email,
          kind: "created",
          name: created.name,
          password: values.password,
        });
      }

      return "saved";
    } catch (error) {
      if (error instanceof ORPCError && error.code === "CONFLICT") {
        return "taken";
      }

      reportError(error, { action: "Users.create_login" });
      return "failed";
    }
  };

  const reset = async (login: LoginRow, password: string) => {
    const asked = openSheet.current;

    try {
      await resetPassword.mutateAsync({ id: login.id, password });

      if (openSheet.current === asked) {
        show({ kind: "reset-done", login, password });
      }

      return true;
    } catch (error) {
      let refusal: string | null = null;

      if (isProtectedRefusal(error)) {
        refusal = copy.errors.protected;
      } else if (error instanceof ORPCError && error.code === "NOT_FOUND") {
        refusal = copy.errors.notFound;
      }

      if (refusal !== null) {
        toast.error(refusal);
        if (openSheet.current === asked) {
          show(null);
        }
        return true;
      }

      reportError(error, { action: "Users.reset_password" });
      return false;
    }
  };

  const disable = async (asked: { login: LoginRow }) => {
    try {
      await disableLogin.mutateAsync({ id: asked.login.id });
      toast.success(
        interpolate(copy.toasts.disabled, { name: asked.login.name })
      );
    } catch (error) {
      const refusal = disableRefusal(error, copy);

      if (refusal === null) {
        reportError(error, { action: "Users.disable_login" });
      }

      toast.error(refusal ?? copy.errors.disable);
    }

    setDisabling((open) => (open === asked ? null : open));
  };

  const sendEnable = async (login: LoginRow) => {
    try {
      await enableLogin.mutateAsync({ id: login.id });
      toast.success(interpolate(copy.toasts.enabled, { name: login.name }));
    } catch (error) {
      if (isProtectedRefusal(error)) {
        toast.error(copy.errors.protected);
        return;
      }

      if (error instanceof ORPCError && error.code === "NOT_FOUND") {
        toast.error(copy.errors.notFound);
        return;
      }

      reportError(error, { action: "Users.enable_login" });
      toast.error(copy.errors.enable);
    }
  };

  const enable = async (login: LoginRow) => {
    // One request per login at a time, whichever others are on their way.
    // Read from a ref: two presses before React draws the first one's busy
    // button would both see the same state.
    if (enablingNow.current.has(login.id)) {
      return;
    }

    enablingNow.current.add(login.id);
    setEnablingIds((ids) => new Set(ids).add(login.id));
    await sendEnable(login);
    enablingNow.current.delete(login.id);
    setEnablingIds((ids) => {
      const left = new Set(ids);
      left.delete(login.id);
      return left;
    });
  };

  const focusBack = (event: Event) => {
    event.preventDefault();
    const target = opener.current?.isConnected
      ? opener.current
      : addButton.current;
    target?.focus();
  };

  return (
    <section data-slot="user-manager" data-testid="user-manager">
      <AdminPage
        primaryAction={
          <Button
            className="w-full md:w-auto"
            data-testid="login-add"
            onClick={(event) => {
              opener.current = event.currentTarget;
              show({ kind: "create" });
            }}
            ref={addButton}
            type="button"
          >
            <Plus aria-hidden="true" />
            {copy.add}
          </Button>
        }
        title={copy.title}
      >
        <p className="text-sm text-muted-foreground">{copy.description}</p>
        {logins.data ? (
          <div className="rounded-lg border bg-card p-4 text-card-foreground md:p-5">
            <ul
              aria-label={copy.list}
              className="divide-y"
              data-testid="login-list"
            >
              {logins.data.map((login) => (
                <LoginItem
                  enabling={enablingIds.has(login.id)}
                  isSelf={login.email === currentEmail}
                  key={login.id}
                  locale={locale}
                  login={login}
                  onDisable={(button) => {
                    opener.current = button;
                    setDisabling({ login });
                  }}
                  onEnable={() => {
                    void enable(login);
                  }}
                  onReset={(button) => {
                    opener.current = button;
                    show({ kind: "reset", login });
                  }}
                />
              ))}
            </ul>
          </div>
        ) : null}
        {logins.isError ? (
          <div
            className="space-y-3 rounded-lg border bg-card p-4 text-card-foreground"
            role="alert"
          >
            <p className="text-sm">{copy.errors.load}</p>
            <Button
              onClick={() => {
                void logins.refetch();
              }}
              size="sm"
              variant="outline"
            >
              {common.tryAgain}
            </Button>
          </div>
        ) : null}
        {logins.isPending ? (
          <div aria-busy="true" data-testid="user-manager-skeleton">
            <span className="sr-only">{common.loading}</span>
            <Skeleton className="h-48 w-full rounded-lg" />
          </div>
        ) : null}
      </AdminPage>
      <Sheet
        onOpenChange={(open) => {
          // A login created or reset while its sheet was closed would lose
          // the one view of what to send: the sheet stays while it saves.
          if (!(open || createLogin.isPending || resetPassword.isPending)) {
            show(null);
          }
        }}
        open={sheet !== null}
      >
        <SheetContent data-testid="login-sheet" onCloseAutoFocus={focusBack}>
          {sheet ? (
            <LoginSheetContent
              onCancel={() => {
                show(null);
              }}
              onCreate={create}
              onReset={reset}
              sheet={sheet}
              signInPath={signInPath}
            />
          ) : null}
        </SheetContent>
      </Sheet>
      <ConfirmDialog
        confirmLabel={copy.disableDialog.confirm}
        description={copy.disableDialog.description}
        isPending={disableLogin.isPending}
        onCloseAutoFocus={focusBack}
        onConfirm={() => {
          if (disabling) {
            void disable(disabling);
          }
        }}
        onOpenChange={(open) => {
          if (!open) {
            setDisabling(null);
          }
        }}
        open={disabling !== null}
        pendingLabel={copy.disableDialog.pending}
        title={interpolate(copy.disableDialog.title, {
          name: disabling?.login.name ?? "",
        })}
      />
    </section>
  );
}

/** The sheet's title, its description and its body for each step. */
function LoginSheetContent({
  onCancel,
  onCreate,
  onReset,
  sheet,
  signInPath,
}: {
  onCancel: () => void;
  onCreate: (values: LoginFormValues) => Promise<LoginFormOutcome>;
  onReset: (login: LoginRow, password: string) => Promise<boolean>;
  sheet: SheetState;
  signInPath: string;
}) {
  const copy = useDictionary().admin.users;

  const header = (title: string, description: string) => (
    <SheetHeader closeLabel={copy.form.close}>
      <SheetTitle>{title}</SheetTitle>
      <SheetDescription>{description}</SheetDescription>
    </SheetHeader>
  );

  const done = (label: string) => (
    <Button className="w-full sm:w-auto" onClick={onCancel} type="button">
      {label}
    </Button>
  );

  if (sheet.kind === "create") {
    return (
      <>
        {header(copy.form.createTitle, copy.form.createDescription)}
        <SheetBody>
          <LoginForm onCancel={onCancel} onSave={onCreate} />
        </SheetBody>
      </>
    );
  }
  if (sheet.kind === "created") {
    return (
      <>
        {header(
          copy.created.title,
          interpolate(copy.created.description, { name: sheet.name })
        )}
        <SheetBody className="flex flex-col gap-5">
          <LoginCredentials
            email={sheet.email}
            password={sheet.password}
            signInPath={signInPath}
          />
          {done(copy.created.done)}
        </SheetBody>
      </>
    );
  }
  if (sheet.kind === "reset") {
    return (
      <>
        {header(
          copy.reset.title,
          interpolate(copy.reset.description, { name: sheet.login.name })
        )}
        <SheetBody>
          <ResetPasswordForm
            onCancel={onCancel}
            onSave={async ({ password }) =>
              await onReset(sheet.login, password)
            }
          />
        </SheetBody>
      </>
    );
  }
  // "reset-done", the one kind left.
  return (
    <>
      {header(
        copy.reset.resultTitle,
        interpolate(copy.reset.resultDescription, {
          name: sheet.login.name,
        })
      )}
      <SheetBody className="flex flex-col gap-5">
        <LoginCredentials
          email={sheet.login.email}
          password={sheet.password}
          signInPath={signInPath}
        />
        {done(copy.reset.done)}
      </SheetBody>
    </>
  );
}

export { UserManager };
