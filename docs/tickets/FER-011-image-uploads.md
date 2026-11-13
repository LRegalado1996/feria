# FER-011 Image upload pipeline

- **Milestone:** M2 Core domain
- **Priority:** P0
- **Status:** todo
- **Depends on:** FER-010

## Goal

A store member can upload phone photos straight from the browser, and the storefront serves them fast.

## Scope

- Direct client uploads to Vercel Blob, with a server route that issues the upload token only to an authorized member of that store.
- Limits enforced on the server: image types only (JPEG, PNG, WebP, HEIC converted in the browser), a size cap, a count cap per article.
- Client-side downscale before upload so a 12 MB phone photo does not travel whole.
- Store width and height so layouts reserve space; serve through `next/image` with the Blob host allowed in `next.config.ts`.
- Deleting an image or an article removes the blobs. A scheduled job removes blobs that no row references.
- A reusable uploader used by articles, banners and the store logo.

## Acceptance criteria

- Uploading works on a mid-range phone over mobile data, with visible progress and retry on failure.
- A token request for another store's article is refused.
- No orphan blobs remain after the cleanup job runs in a test.

## Notes

Function bodies are capped at 4.5 MB on Vercel, which is why the file never passes through our own route.

## Reporting

Post in Slack as the `slack-reporting` skill describes: start and finish in `#feria-tickets`, the PR and its review in `#feria-prs`, and any deployment it causes in `#feria-deploys`.
