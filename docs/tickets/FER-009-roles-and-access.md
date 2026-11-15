# FER-009 Roles, memberships and closed sign-up

- **Milestone:** M2 Core domain
- **Priority:** P0
- **Status:** done
- **Depends on:** FER-008

## Goal

Only invited people can sign in, and every admin action is authorized against the role and the store.

## Scope

- Remove public sign-up from Better Auth and from the UI. Accounts are created by a superadmin or a store member.
- `user.role` (`superadmin`, `member`) and the `store_member` table.
- Procedure builders next to `protectedProcedure`: `superadminProcedure`, and `storeProcedure`, which takes the store slug from the input, loads the store and checks the caller is a superadmin or a member of it. It hands the procedure a trusted `store`.
- A first-run way to create the superadmin: a script that reads the email from an environment variable, refused when a superadmin already exists.
- Rate limiting on sign-in.
- `store.create` becomes a `superadminProcedure` and `store.update` a `storeProcedure`; the temporary `storeWriteProcedure` and its production gate (FER-008) are deleted.
- Update `docs/agents/security.md` with the authorization model.

## Acceptance criteria

- A member of store A gets "not found" for every store B resource, proven by integration tests on each procedure builder.
- The sign-up endpoint is gone: calling it directly fails.
- Seed data includes one superadmin and one member for local work and e2e.

## Outcome

- `user.role` (`superadmin`, `member`, default `member`) and `store_member`, in migration `0002`.
- Sign-up is closed three ways: Better Auth's `disableSignUp`, a 404 on `/api/auth/sign-up/*`, and no sign-up mode in the form. Logins are created on the server with `createAccount`.
- `superadminProcedure` and `storeProcedure(schema)` in `src/server/api/orpc`; the model is in `docs/agents/security.md` § Roles and stores. `store.create` and `store.update` now require a superadmin, which replaces FER-008's production lock; members edit their own store through `storeProcedure` with the settings screen (FER-014).
- `pnpm db:create-superadmin` reads `SUPERADMIN_EMAIL` and `SUPERADMIN_PASSWORD` (optional `SUPERADMIN_NAME`) and is refused once a superadmin exists.
- Sign-in: 5 attempts a minute per IP. Two-factor for superadmins is [FER-037](FER-037-superadmin-two-factor.md).
- Seed: `test@example.com` (superadmin), `member@example.com` (member of `lr-market`), `multi@example.com` (member of both stores), all `password123`.

## Notes

Buyers never have an account. Nothing in the storefront depends on a session.

## Reporting

Report this ticket in Slack as the `slack-reporting` skill describes. The skill is the only place that says which event goes to which channel and who posts it.
