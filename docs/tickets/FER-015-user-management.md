# FER-015 User management

- **Milestone:** M3 Admin
- **Priority:** P1
- **Status:** todo
- **Depends on:** FER-013

## Goal

Superadmins manage every login; store members manage the logins of their own store.

## Scope

- Platform users: list with store memberships, create, promote to or demote from superadmin, disable, reset password.
- Store users: list members, add one (new account, or an existing account by email), remove one.
- New accounts get a temporary password shown once to whoever created them and must change it at first sign-in. Email invitations wait until an email service exists.
- Safeguards: the last superadmin cannot be demoted or disabled; a member cannot remove themselves if they are the store's last member.
- Disabling a user ends their sessions.

## Acceptance criteria

- A member cannot list, add or remove users of another store, by UI or by direct API call.
- Each safeguard has a test that fails when the rule is removed.
- E2E: a superadmin creates a member, who signs in, changes the password and reaches their store.

## Notes

Until this ships, users are created with the seed script from FER-009. That is enough for the fair if time runs short.

## Reporting

Report this ticket in Slack as the `slack-reporting` skill describes. The skill is the only place that says which event goes to which channel and who posts it.
