# FER-018 Fill the article from its photos with Claude

- **Milestone:** M3 Admin
- **Priority:** P0
- **Status:** todo
- **Depends on:** FER-017

## Goal

One button turns the uploaded photos into a complete article in both languages. This is the moment that sells the product.

## Scope

- A "fill with AI" button in the wizard, enabled once a photo is uploaded. An optional one-line hint ("silver chain, 45 cm") improves the result.
- A server procedure sends the photos and the store's context (name, category list, tone, currency) to Claude through Vercel AI Gateway and asks for structured output validated by zod: title, description, suggested category (one of the store's, or a proposed new one), SEO title and description, alt text per photo, all in Spanish and English.
- The price is never invented. It stays empty unless the hint states one.
- The prompt lives in one versioned file with its own tests against recorded responses. It writes for Uruguayan shoppers: natural rioplatense Spanish, no exaggerated claims, no materials or certifications that cannot be seen in the photo.
- Results stream into the form field by field. Every field stays editable, each can be regenerated on its own, and "undo" restores what was there before.
- Fields the person already typed are kept unless they choose to overwrite.
- Every call writes an `ai_generation` row: store, user, article, model, tokens, cost, duration, outcome, and later whether the result was kept.
- Limits: per-user and per-store rate limits and a daily cap per store, with a clear message when reached. Failures and refusals degrade to the manual form.

## Acceptance criteria

- From three photos of a bracelet, the form is filled in both languages in a few seconds and can be published after typing only the price.
- The model's output is treated as untrusted: validated, length-limited and escaped; a malformed answer never reaches the form.
- A member of another store cannot trigger a generation for this store's article.
- Unit tests cover parsing, limits and logging without calling the model; one manual check against the real model is recorded in the PR.

## Notes

Read the `claude-api` and `vercel:ai-sdk` skills and the installed AI SDK docs before writing code; pick the model there, weighing quality of Spanish copy against cost per article. Photos are sent as resized copies, not originals.
