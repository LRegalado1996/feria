# FER-035 Number input that accepts either decimal separator

- **Milestone:** M3 Admin
- **Priority:** P0
- **Status:** todo
- **Depends on:** FER-004

## Goal

A store owner typing a price never gets a different amount than the one they typed, whatever keyboard their phone shows.

## Scope

- Today the number field (`atoms/input` with `type="number"`) reads what is typed in the notation of the page's language: on a Spanish page a dot is a thousands separator and is dropped, on an English page a comma is. The decimal keypad follows the phone's region, not the page: a Uruguayan phone on `/en` offers only a comma, and `12,50` becomes 1250. A value pasted as `12.50` on a Spanish page becomes 1250 too. Nothing warns.
- Decide the rule and implement it in `toPlainNumberText` (`src/lib/utils/format.ts`): for example, a single separator followed by one or two digits is a decimal in either language, and input that stays ambiguous is refused with a message instead of guessed.
- Unit tests for both languages and both separators, including pasted values, and an e2e on the first form that takes a price.

## Out of scope

Formatting prices for display (`formatPrice`, done in FER-004).

## Acceptance criteria

- `12,50` and `12.50` are both twelve and a half on `/` and on `/en`.
- No typed or pasted value changes magnitude silently: it is read as typed or refused with a visible reason.

## Notes

Found in the review of FER-004. No form uses the number field yet; the article wizard ([FER-017](FER-017-article-wizard.md)) is the first, so this lands before it.

## Reporting

Report this ticket in Slack as the `slack-reporting` skill describes. The skill is the only place that says which event goes to which channel and who posts it.
