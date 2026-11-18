# FER-054 Saving one article from two tabs

- **Milestone:** M3 Admin
- **Priority:** P2
- **Status:** todo
- **Depends on:** FER-017

## Goal

An article is saved whole ([FER-017](FER-017-article-wizard.md): `product.update` writes the texts, the price, the photos and the filters in one go), and the last save wins. Two tabs or two devices open on the same article overwrite each other without a word: a draft's autosave from a tab left open an hour ago puts back the old texts, and a published article's "Guardar cambios" does the same past its confirm. It also lets a photo be lost: a tab removes a photo, the save deletes its file once it commits (`discardBlobs`), and a stale tab that still shows it saves it again, so the article names a file that is gone. Found in the review of FER-017 (CodeRabbit and a second reviewer, before the PR).

## Scope

- `product.update` takes the `updatedAt` the browser started from and, under the article's row lock, refuses with `CONFLICT` when the article changed since. A refused save keeps what was typed.
- The wizard says so and offers to load the article as it is now; a draft's autosave stops until the person chooses.
- A photo address the article no longer holds and the save did not just upload is refused, so a stale tab cannot bring back a deleted file.
- A save never stores a new photo whose file is gone: an editor left open past the two days the orphan cleanup spares an unsaved upload (`cleanUpOrphanBlobs`) would otherwise save a dead address. Check the file exists before the save commits (the Blob store's `head`, with the e2e's stand-in answering it), or keep the upload alive while it waits in a form. CodeRabbit on PR #64.
- A stale save cannot drop photos another tab added since: with the precondition above it is refused, never applied with the photos it did not know.
- A published article's copy kept in this browser is keyed to the version its form was loaded from, not to a newer one a background read brings, so a reload after another tab's save drops the copy instead of restoring old values over the new article.
- Unit and integration tests on both sides of the check (same `updatedAt`, an older one); an e2e with two pages on one article.

## Acceptance criteria

- A save from a tab that missed another save is refused and says why; nothing it typed is lost.
- No article ever names a photo file the store deleted.

## Reporting

Report this ticket in Slack as the `slack-reporting` skill describes. The skill is the only place that says which event goes to which channel and who posts it.
