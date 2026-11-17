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
- A reusable uploader used by articles, banners and catalog covers ([FER-043](FER-043-category-groups-and-pages.md): a computer and an optional phone image per catalog page; the logo is code since [FER-038](FER-038-single-store.md)).

The first consumer is the catalog page covers of FER-043 (a desktop image and an optional phone image per group, category and the all-articles page), wired into the admin's categories screen once that branch lands. Articles (FER-017) and banners (FER-020) reuse the same pieces. The count cap per article belongs to FER-017, which adds an article's photos.

## Acceptance criteria

- Uploading works on a mid-range phone over mobile data, with visible progress and retry on failure.
- An anonymous token request is refused.
- No orphan blobs remain after the cleanup job runs in a test.

## Notes

Function bodies are capped at 4.5 MB on Vercel, which is why the file never passes through our own route.

## Decisions

- **The token is an oRPC procedure, not a separate route:** `upload.createToken` (`POST /api/orpc/upload/createToken`, REST twin `POST /api/docs/admin/uploads/token`), built on `adminProcedure`: session first, then the limits, then the login re-read from the database. The server signs the token itself (`generateClientTokenFromReadWriteToken`) and the browser sends the file with `put` from `@vercel/blob/client`. No upload-completed webhook either (it only reaches a deployed URL).
- **What the token allows:** one file, at a pathname the server picks (`<namespace>/<purpose>/<uuid>.<ext>`), of the declared type (JPEG, PNG or WebP) and at most the declared size, which must be under the purpose's cap (5 MB for a cover), valid 10 minutes, never overwriting. The Blob store refuses anything else.
- **One folder per deployment** (`production`, `qa`, `preview`, `local`): qa, previews and local runs share one Blob store while each has its own database, so the cleanup of one never sees another's files.
- **HEIC:** no package. The file input asks for `image/*`, so an iPhone hands over a JPEG, and the browser decodes whatever it can (Safari reads HEIC). Every photo is redrawn on a canvas at 2400 px on its longest side at most, upright, and re-encoded as WebP, or JPEG where the browser cannot write WebP (Safari). Re-encoding also drops the photo's metadata, its location included.
- **Deleting:** a write that removes a row holding an image answers the addresses, and the router deletes those files after the commit and after the response (`discardBlobs`). Only files of this deployment's folder are ever deleted; a failed deletion is reported and left to the cleanup.
- **Cleanup:** `cleanUpOrphanBlobs(db, blobStore, { olderThan })` lists the deployment's folder, reads every image column (`IMAGE_URL_COLUMNS`, which a test holds to the schema) and deletes the files no row names that are older than `olderThan` (two days, `ORPHAN_BLOB_MIN_AGE_MS`: an upload whose form is saved within two days is safe).
- **The cleanup runs once a day** (approved by Lucas on 2026-11-17): `vercel.json` calls `GET /api/cron/clean-up-blobs` at 07:00 UTC, 04:00 in Montevideo (Hobby allows one run a day, somewhere within that hour). The route answers 401 unless `Authorization` is `Bearer <CRON_SECRET>`, compared in constant time, and 503 when no secret is set, so it never runs open; it answers `{ checked, deleted }` and logs the counts. The production build refuses to start without `CRON_SECRET`.
- **qa's files are never cleaned automatically.** Vercel runs crons on the production deployment only, and qa has no `CRON_SECRET`, so its route answers 503. qa's folder holds test photos only; if it ever needs a sweep, a `CRON_SECRET` set for the `qa` branch and one `curl -H "Authorization: Bearer …" https://<qa URL>/api/cron/clean-up-blobs` does it.

## Outcome so far

- `src/server/api/routers/upload.ts` and `src/server/services/upload.ts`: the token, `deleteBlobs`, `cleanUpOrphanBlobs`, `IMAGE_URL_COLUMNS`.
- `src/app/api/cron/clean-up-blobs/route.ts` and `src/server/api/utils/cron.ts`: the scheduled cleanup and its secret check; `vercel.json` `crons`.
- `src/server/api/utils/blob-store.ts`: the deployment's store from `BLOB_READ_WRITE_TOKEN` and `discardBlobs`. `product.delete` deletes its photos' files.
- `src/lib/schemas/upload`: purposes, types, caps, `createUploadTokenSchema` and `uploadedImageSchema` (address and size in pixels, for a form to save). `src/lib/blob/`: the store's host from its token, the folders and `isOwnBlobUrl`.
- `next.config.ts` lets `next/image` serve this deployment's own Blob host only.
- `src/lib/upload/prepare-image.ts` (the downscale), `src/lib/hooks/upload/use-image-upload.ts` (progress, retry, cancel) and `molecules/image-uploader`, with its copy in `src/content/{es,en}/admin.ts`.
- Left: the covers' upload in the admin's categories screen and its e2e (with the upload intercepted), once FER-043 is merged in.
- **The one manual step:** in Vercel, Project → Settings → Environment Variables, add `CRON_SECRET` (a random value of at least 16 characters, such as the output of `openssl rand -hex 32`) to the **Production** environment only, before the next production deployment: that build fails without it.

## Reporting

Report this ticket in Slack as the `slack-reporting` skill describes. The skill is the only place that says which event goes to which channel and who posts it.
