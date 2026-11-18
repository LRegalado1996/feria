# FER-053 The bottom bar stays above the iPhone keyboard

- **Milestone:** M3 Admin
- **Priority:** P1
- **Status:** todo
- **Depends on:** FER-017, FER-040

## Goal

On a phone the admin's main action sits in a bar under the thumb (`molecules/admin-page`), and [FER-017](FER-017-article-wizard.md)'s decision is that the keyboard covers neither the field nor the action. The article pages export `interactiveWidget: "resizes-content"`, which Chrome on Android honours: the page shrinks for the keyboard and the bar rides above it. Safari on iOS ignores it: the layout viewport keeps its height, the keyboard covers the fixed bar, and "Continuar", "Publicar" or "Guardar cambios" are out of reach while typing.

## Scope

- On iOS Safari, keep the bar above the keyboard while a field has focus, with the `visualViewport` API (its `height` and `offsetTop` on `resize` and `scroll`), or hide the bar while typing if riding above it turns out janky; decided after trying both on a real iPhone.
- The same for every admin screen with a bar under the thumb (the wizard, the settings, the orders' moves).
- No change on a computer or on Android.

## Acceptance criteria

- On a real iPhone (Safari), typing in the article's title, description or price leaves the step's action reachable without closing the keyboard, and the focused field is not covered.
- Unit tests for the hook on both sides (keyboard open and closed, `visualViewport` missing).

## Reporting

Report this ticket in Slack as the `slack-reporting` skill describes. The skill is the only place that says which event goes to which channel and who posts it.
