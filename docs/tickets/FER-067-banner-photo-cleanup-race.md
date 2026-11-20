# FER-067 A banner photo is never deleted while a save starts using it

- **Milestone:** M3 Admin
- **Priority:** P2
- **Status:** todo
- **Depends on:** FER-011, FER-020

## Goal

A saved banner never points at a photo file that is gone.

## The problem

Raised by CodeRabbit on #68 (FER-020). When a banner's photo is replaced, removed or the banner deleted, the old file is discarded after the commit (`discardBlobs`): it checks that no row still references the file, then deletes it from Blob, without the pages' lock. A save committed between that check and the delete can reference the file, which is then deleted under it. And a save may reuse a URL whose file a cleanup already removed: `assertOwnUpload` checks that the URL is this deployment's banner upload, not that the file still exists.

## Scope

Decide between:

1. holding the pages' advisory lock across the reference check and the Blob delete (a lock held across an external call: bound its time), or
2. checking, before the save commits, that every reused photo URL still exists in Blob (a HEAD per reused URL), and leaving the cleanup as is.

## Acceptance criteria

- A two-writer test (a save reusing a URL while its cleanup runs) never ends with a banner whose file is gone.

## Reporting

Report this ticket in Slack as the `slack-reporting` skill describes. The skill is the only place that says which event goes to which channel and who posts it.
