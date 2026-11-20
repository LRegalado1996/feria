# FER-053 The bottom bar stays above the iPhone keyboard

- **Milestone:** M3 Admin
- **Priority:** P1
- **Status:** in progress
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

## Outcome

- **Riding above, not hiding.** The bar rides above the keyboard; hiding it while typing was not built. The owner tries it on his iPhone and decides (below).
- **The hook:** `useAboveKeyboard` (`src/lib/hooks/ui/use-above-keyboard.ts`) returns a callback ref for the bar. On the visual viewport's `resize` and `scroll`, once per animation frame, it measures how far the visible part ends above the bar's own bottom edge (the layout viewport's bottom: `getBoundingClientRect().bottom` plus the shift it already gave the bar) and writes it to `--keyboard-inset` on the bar, with `data-keyboard="open"` while it is more than zero. Reads come before writes, and an unchanged value writes nothing. When the keyboard comes (`resize`) or focus moves (`focusin`) it scrolls the focused field out from under the bar, 8 px clear of it and never past the visible top; a plain `scroll` never does, so a field the user scrolled under the bar stays there. It also does when Safari pans the visible part down to the page's bottom for a field there: the bar then sits right on the keyboard without moving (no inset) and can still hide that field. A field inside a dialog (the banner's side sheet, a confirmation) is never scrolled for: the dialog's overlay already covers the bar.
- **Where it does nothing:** where the layout viewport already shrank (Chrome on Android with `resizes-content`: the bar's edge already meets the visible bottom, so nothing moves twice), on a computer and from `md` up (the action sits in the top bar, far above the visible bottom), under pinch zoom (`scale` other than 1), during a rubber-band scroll, without `visualViewport`, and in the server render (nothing is written until a keyboard covers the bar, so hydration matches).
- **Where it is applied:** once, in `molecules/admin-primary-action`, the bar `molecules/admin-page` renders for `primaryAction`; its CSS moves it with `max-md:data-[keyboard=open]:-translate-y-(--keyboard-inset)` (a transform: no layout) and drops the home bar's padding, which the keyboard covers. So every screen with a main action gets it: the article wizard's journey and single screen ("Continuar", "Publicar", "Guardar cambios", "Más acciones"), the settings ("Guardar"), an order's moves, and the article list's, categories' and filters' "Nuevo" buttons; stacked on FER-020 and FER-034, also the home's curation ("Guardar orden", `/admin/home`) and the coming-soon screen's main action (`/admin/settings/coming-soon`), both through `molecules/admin-page`. The banner's side sheet (`molecules/sheet`) has its own foot inside the dialog, not this bar, and is not covered here.
- **Switching to hiding:** the hook already says when the keyboard is open (`data-keyboard`), so hiding the bar while typing is a CSS change in `admin-primary-action.tsx` (`hidden` in place of the translate, under the same open-keyboard variant), plus the hook not scrolling the field for a bar that is not there.
- **Tests:** `use-above-keyboard.test.tsx` (keyboard open, closed and scrolled, 1 px and fractions, Android's shrunk layout, pinch zoom, rubber band, the top bar from `md` up, `visualViewport` missing, one frame for many events, the focused field revealed or left alone on both sides of its 8 px, focus in the bar, listeners and frame removed on unmount, the server render); `admin-primary-action.test.tsx` (the wiring, hydration). `src/e2e/tests/admin/phone-keyboard.e2e.ts` replaces `visualViewport` with a stand-in whose height the test shrinks, since Chromium opens no keyboard: on the settings screen at 375 px the bar ends where the played keyboard starts, the last field ends above the bar, "Guardar" can be pressed there, and the bar comes back down; a window that shrank itself (Android) moves it no further; on a computer the action stays in the top bar.
- **Not covered without a real iPhone:** Safari's own keyboard and its animation (Safari reports `resize` as the keyboard settles, so the bar may jump rather than glide), how Safari's own scroll to the focused field and the hook's reveal combine, the QuickType bar and the form assistant above the keyboard, and whether following `scroll` while the keyboard is open looks smooth enough. That is the first acceptance criterion.
- **Android without `resizes-content`:** only the article pages export `interactiveWidget: "resizes-content"`. On the other screens Chrome on Android keeps the layout viewport's height for the keyboard, as Safari does, so the hook now lifts the bar there too, where before the keyboard covered it.
- **Pending: check on a real iPhone.** Typing in the article's title, description and price (and a field of the settings) in Safari, with the step's action reachable and the field not covered; then decide whether riding stays or the bar hides while typing. The ticket stays in progress until then.

## Reporting

Report this ticket in Slack as the `slack-reporting` skill describes. The skill is the only place that says which event goes to which channel and who posts it.
