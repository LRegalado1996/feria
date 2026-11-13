# FER-004 Spanish and English with a toggle

- **Milestone:** M0 Foundation
- **Priority:** P0
- **Status:** done
- **Depends on:** FER-001

## Goal

Every page renders in Spanish by default and in English under `/en`, with a toggle that keeps the visitor on the same page.

## Scope

- Locale in the URL: no prefix is Spanish, `/en/...` is English. Applies to the storefront and the admin.
- Typed dictionaries in `src/content/{es,en}/`, one file per area, with a type check that fails when a key exists in one language only. No interface text hardcoded in components.
- A `getDictionary(locale)` for server components and a small provider for client components.
- `src/lib/utils/format.ts` takes the locale per request instead of one app-wide constant: prices take the currency as an argument (`$ 1.290` for pesos, `US$ 12,50` for dollars in `es-UY`) and dates in the store's time zone (`America/Montevideo`).
- `<html lang>`, `hreflang` alternates and canonical URLs follow the locale.
- A locale toggle molecule that swaps the prefix and keeps path and search params.
- Amend `design.md`: replace "one product language per app" with the bilingual rule.

## Out of scope

Translating database content (handled by `*_translation` tables in FER-008 and FER-010).

## Acceptance criteria

- `/` and `/en` render the same page in each language; the toggle round-trips without losing the query string.
- A missing key in either dictionary fails `pnpm typecheck`.
- An e2e test covers the toggle and the `lang` attribute.

## Notes

Prefer our own dictionaries over a library: the copy volume is small and the template pins and vets every dependency. Revisit if plurals or rich text get painful.

## Reporting

Report this ticket in Slack as the `slack-reporting` skill describes. The skill is the only place that says which event goes to which channel and who posts it.
