# FER-037 Two-factor sign-in for superadmins

- **Milestone:** M3 Admin
- **Priority:** P1
- **Status:** todo
- **Depends on:** FER-009, FER-013

## Goal

The one login that reaches every store cannot be taken over with a guessed or leaked password.

## Scope

- Better Auth's `twoFactor` plugin (TOTP), required of superadmins on the live production deployment only (`VERCEL_ENV === "production"`), so qa, previews and local work stay usable.
- Enforced in pages and in every procedure a superadmin can call (`protectedProcedure` and everything built on it, `storeProcedure` included, since a superadmin reaches every store through it), not only at sign-in; a superadmin cannot turn it off on production.
- The sign-in form handles `twoFactorRedirect` (`docs/agents/security.md` § Better Auth).
- The plugin's own routes that duplicate an operation the app authorizes answer 404.

## Acceptance criteria

- On production, a superadmin without 2FA set up is sent to set it up and reaches nothing else.
- A member is never asked for a second factor.
- Unit and integration tests cover the gate on both sides; e2e covers the setup and a sign-in with a code.

## Notes

Found while closing sign-up in FER-009: `docs/agents/security.md` § 2FA recipe asks for it once a privileged user exists, and Better Auth's sign-in limiter is a fixed window.

## Reporting

Report this ticket in Slack as the `slack-reporting` skill describes. The skill is the only place that says which event goes to which channel and who posts it.
