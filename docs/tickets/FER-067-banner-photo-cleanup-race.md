# FER-067 A banner photo is never deleted while a save starts using it

- **Milestone:** M3 Admin
- **Priority:** P2
- **Status:** todo
- **Depends on:** FER-011, FER-020

## Goal

A saved banner never points at a photo file that is gone.

## The problem

Raised by CodeRabbit on #68 (FER-020) and #76 (FER-060). When a banner's photo is replaced, removed or the banner deleted, the old file is discarded after the commit (`discardBlobs`): it checks that no row still references the file, then deletes it from Blob, without the pages' lock. The scheduled job (`cleanUpOrphanBlobs`, FER-011) does the same for every file older than two days that no row names, also without the lock. A save committed between either check and its delete can reference the file, which is then deleted under it. And a save may reuse a URL whose file a cleanup already removed: `assertOwnUpload` checks that the URL is this deployment's banner upload, not that the file still exists.

## Scope

Neither half alone closes both orders. Holding a lock across the cleanup's check and delete still lets a later save reuse the URL it deleted; checking that the file exists before the save commits still lets a cleanup delete it between that check and the commit. Both, under one lock:

1. Both cleanups, `discardBlobs` and the scheduled `cleanUpOrphanBlobs`, take the pages' advisory lock, read the references only once they hold it, and delete the unreferenced files from Blob before releasing the lock (a lock held across an external call: bound its time, and leave the file when the bound is hit; a file left behind is harmless, a file deleted under a row is not).
2. A save that reuses a photo URL checks, under the same lock and before it commits, that the file still exists in Blob (a HEAD per reused URL), and refuses the save when it does not.

## Acceptance criteria

- Cleanup first: a save that reuses a URL after its cleanup deleted the file is refused, and no banner points at it.
- Save first: a cleanup, the discard or the scheduled one, that runs while a save reusing the URL holds the lock waits for it, then finds the reference and keeps the file.
- A photo whose file still exists stays reusable.

## Reporting

Report this ticket in Slack as the `slack-reporting` skill describes. The skill is the only place that says which event goes to which channel and who posts it.
