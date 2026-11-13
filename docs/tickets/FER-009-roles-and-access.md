# FER-009 Roles, memberships and closed sign-up

- **Milestone:** M2 Core domain
- **Priority:** P0
- **Status:** todo
- **Depends on:** FER-008

## Goal

Only invited people can sign in, and every admin action is authorized against the role and the store.

## Scope

- Remove public sign-up from Better Auth and from the UI. Accounts are created by a superadmin or a store member.
- `user.role` (`superadmin`, `member`) and the `store_member` table.
- Procedure builders next to `protectedProcedure`: `superadminProcedure`, and `storeProcedure`, which takes the store slug from the input, loads the store and checks the caller is a superadmin or a member of it. It hands the procedure a trusted `store`.
- A first-run way to create the superadmin: a script that reads the email from an environment variable, refused when a superadmin already exists.
- Rate limiting on sign-in.
- Update `docs/agents/security.md` with the authorization model.

## Acceptance criteria

- A member of store A gets "not found" for every store B resource, proven by integration tests on each procedure builder.
- The sign-up endpoint is gone: calling it directly fails.
- Seed data includes one superadmin and one member for local work and e2e.

## Notes

Buyers never have an account. Nothing in the storefront depends on a session.
