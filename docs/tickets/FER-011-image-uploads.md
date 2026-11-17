# FER-011 Image upload pipeline

- **Milestone:** M2 Core domain
- **Priority:** P0
- **Status:** in progress
- **Depends on:** FER-010

## Goal

An admin can upload phone photos straight from the browser, and the storefront serves them fast.

## Scope

- Direct client uploads to Vercel Blob, with a server route that issues the upload token only to a signed-in admin.
- Limits enforced on the server: image types only (JPEG, PNG, WebP, HEIC converted in the browser), a size cap, a count cap per article.
- Client-side downscale before upload so a 12 MB phone photo does not travel whole.
- Store width and height so layouts reserve space; serve through `next/image` with the Blob host allowed in `next.config.ts`.
- Deleting an image or an article removes the blobs. A scheduled job removes blobs that no row references.
- A reusable uploader used by articles and banners (the logo is code since [FER-038](FER-038-single-store.md)).

The first consumer is the catalog page covers of FER-043 (a desktop image and an optional phone image per group, category and the all-articles page), wired into the admin's categories screen once that branch lands. Articles (FER-017) and banners (FER-020) reuse the same pieces. The count cap per article belongs to FER-017, which adds an article's photos.

## Acceptance criteria

- Uploading works on a mid-range phone over mobile data, with visible progress and retry on failure.
- An anonymous token request is refused.
- No orphan blobs remain after the cleanup job runs in a test.

## Notes

Function bodies are capped at 4.5 MB on Vercel, which is why the file never passes through our own route.

## Decisions

- **The token is an oRPC procedure, not a separate route:** `upload.createToken` (`POST /api/orpc/upload/createToken`, REST twin `POST /api/docs/admin/uploads/token`), built on `adminProcedure`: session first, then the limits, then the login re-read from the database. The server signs the token itself (`generateClientTokenFromReadWriteToken`) and the browser sends the file with `put` from `@vercel/blob/client`. No route folder outside `src/app/api/{auth,orpc,health,docs}` was needed, and no upload-completed webhook (it only reaches a deployed URL).
- **What the token allows:** one file, at a pathname the server picks (`<namespace>/<purpose>/<uuid>.<ext>`), of the declared type (JPEG, PNG or WebP) and at most the declared size, which must be under the purpose's cap (5 MB for a cover), valid 10 minutes, never overwriting. The Blob store refuses anything else.
- **One folder per deployment** (`production`, `qa`, `preview`, `local`): qa, previews and local runs share one Blob store while each has its own database, so the cleanup of one never sees another's files.
- **HEIC:** no package. The file input asks for `image/*`, so an iPhone hands over a JPEG, and the browser decodes whatever it can (Safari reads HEIC). Every photo is redrawn on a canvas at 2400 px on its longest side at most, upright, and re-encoded as WebP, or JPEG where the browser cannot write WebP (Safari). Re-encoding also drops the photo's metadata, its location included.
- **Deleting:** a write that removes a row holding an image answers the addresses, and the router deletes those files after the commit and after the response (`discardBlobs`). Only files of this deployment's folder are ever deleted; a failed deletion is reported and left to the cleanup.
- **Cleanup:** `cleanUpOrphanBlobs(db, blobStore, { olderThan })` lists the deployment's folder, reads every image column (`IMAGE_URL_COLUMNS`, which a test holds to the schema) and deletes the files no row names that are older than `olderThan` (two days is the intended age: an upload whose form was never saved is an orphan until then).
- **Scheduling the cleanup is a step for Lucas.** Vercel runs a cron as a GET to a route of the app, with `Authorization: Bearer $CRON_SECRET`, on the production deployment only (on Hobby, once a day). That needs a new route folder (`src/app/api/cron/...`), a new `CRON_SECRET` variable and a `crons` entry in `vercel.json`, all of which need Lucas's approval first.

## Outcome so far

- `src/server/api/routers/upload.ts` and `src/server/services/upload.ts`: the token, `deleteBlobs`, `cleanUpOrphanBlobs`, `IMAGE_URL_COLUMNS`.
- `src/server/api/utils/blob-store.ts`: the deployment's store from `BLOB_READ_WRITE_TOKEN` and `discardBlobs`. `product.delete` deletes its photos' files.
- `src/lib/schemas/upload`: purposes, types, caps, `createUploadTokenSchema` and `uploadedImageSchema` (address and size in pixels, for a form to save). `src/lib/blob/`: the store's host from its token, the folders and `isOwnBlobUrl`.
- `next.config.ts` lets `next/image` serve this deployment's own Blob host only.
- `src/lib/upload/prepare-image.ts` (the downscale), `src/lib/hooks/upload/use-image-upload.ts` (progress, retry, cancel) and `molecules/image-uploader`, with its copy in `src/content/{es,en}/admin.ts`.
- Left: the covers' upload in the admin's categories screen and its e2e (with the upload intercepted), once FER-043 is merged in; the cleanup's schedule (above).

## Reporting

Report this ticket in Slack as the `slack-reporting` skill describes. The skill is the only place that says which event goes to which channel and who posts it.
