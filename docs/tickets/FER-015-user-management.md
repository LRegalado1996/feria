# FER-015 User management

- **Milestone:** M3 Admin
- **Priority:** P1
- **Status:** todo
- **Depends on:** FER-038, FER-040

## Goal

An admin manages the logins of the store from `/admin/users`.

Rescoped on 2026-11-16: there is one role, `admin` ([FER-038](FER-038-single-store.md)), so promotions, memberships and the platform list are gone. `user.role` stays for roles that may come later.

## Scope

- List the logins, create one, disable one, reset a password.
- New accounts get a temporary password shown once to whoever created them and must change it at first sign-in. Email invitations wait until an email service exists.
- Safeguard: the last enabled admin cannot be disabled, and nobody disables themselves.
- Disabling a user ends their sessions.
- Built in the admin shell and cards of [FER-040](FER-040-admin-redesign.md).

## Acceptance criteria

- An anonymous call to any of these procedures is refused.
- Each safeguard has a test that fails when the rule is removed.
- E2E: an admin creates a login, which signs in, changes the password and reaches the orders.

## Notes

Until this ships, logins are created with `pnpm db:create-superadmin` and the seed. That is enough for the fair if time runs short.

## Reporting

Report this ticket in Slack as the `slack-reporting` skill describes. The skill is the only place that says which event goes to which channel and who posts it.
