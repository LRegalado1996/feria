# FER-037 Two-factor sign-in for admins

- **Milestone:** M3 Admin
- **Priority:** P1
- **Status:** todo
- **Depends on:** FER-009, FER-013

## Goal

A login that reaches the whole admin cannot be taken over with a guessed or leaked password.

## Scope

- Better Auth's `twoFactor` plugin (TOTP), required of every admin (the one role since [FER-038](FER-038-single-store.md)) on the live production deployment only (`VERCEL_ENV === "production"`), so qa, previews and local work stay usable.
- Enforced in pages and in every admin procedure, not only at sign-in; an admin cannot turn it off on production.
- The sign-in form handles `twoFactorRedirect` (`docs/agents/security.md` § Better Auth).
- The plugin's own routes that duplicate an operation the app authorizes answer 404.

## Acceptance criteria

- On production, an admin without 2FA set up is sent to set it up and reaches nothing else.
- Unit and integration tests cover the gate on both sides; e2e covers the setup and a sign-in with a code.

## Notes

Found while closing sign-up in FER-009: `docs/agents/security.md` § 2FA recipe asks for it once a privileged user exists, and Better Auth's sign-in limiter is a fixed window.

## Reporting

Report this ticket in Slack as the `slack-reporting` skill describes. The skill is the only place that says which event goes to which channel and who posts it.
