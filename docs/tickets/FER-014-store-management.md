# FER-014 Company settings

- **Milestone:** M3 Admin
- **Priority:** P0
- **Status:** done
- **Depends on:** FER-038, FER-040

## Goal

The store keeps its own details up to date from `/admin/settings`.

Rescoped on 2026-11-16: the site is one store ([FER-038](FER-038-single-store.md)), so creating, activating and choosing stores is gone, and so is the theme editor (colors and logo are code).

## Scope

- Name, tagline and description in both languages, WhatsApp number, Instagram and TikTok links.
- Currency: decided on 2026-11-18: the currency is fixed per store and not editable from the admin; changing it is a manual database change. The screen shows it as text, and `store.update` drops a currency it is sent. Past orders keep the currency they were placed in.
- WhatsApp number validated and stored in international format.
- Saving invalidates the cached store so the storefront updates at once.
- The form sends every field it loaded. Refusing a save made from a stale copy: dropped on 2026-11-18: one person edits at a time for now.
- Built in the admin shell and cards of [FER-040](FER-040-admin-redesign.md).

## Acceptance criteria

- A changed tagline shows in the home's intro on the next visit. (FER-044 gave the footer Pepe's story in the tagline's place; the story stays in code, decided 2026-11-18.)
- (A stale save refused with a message: dropped on 2026-11-18: one person edits at a time for now.)
- E2E: change the WhatsApp number, see the footer's link follow.

## Outcome

- **Screen** (`/admin/settings`, `/en/admin/settings`; `organisms/settings-manager`, `molecules/settings-form`): in the FER-040 shell, three cards: the store (its name, and its currency as text with why it cannot change), the texts (tagline and description in Spanish and in English, all four required) and the contact and socials (WhatsApp, Instagram, TikTok, blank meaning none). "Guardar" is the top bar's main action, under the thumb on a phone, enabled once React owns the page. Errors under their fields; a save says how it ended in a toast; a failed one is reported (`Store.update_settings`) and keeps everything typed; every field is shut while it travels. The store is fetched on the server so the form opens filled; after a save the screen shows the store as stored. The "Coming soon" placeholder no longer covers settings.
- **WhatsApp**: the form reads the number as typed, through the checkout's `normalizePhone` (`createStoreSettingsFormSchema`): spaces, dots, dashes and parentheses dropped, `00` read as `+`, a Uruguayan mobile in local form given `+598`; blank is no WhatsApp; anything else is refused under the field. The API keeps taking E.164 only.
- **Currency**: fixed per store (decided 2026-11-18). `currencyCode` left `updateStoreSchema` and what `updateStore` writes, so a currency sent to `store.update` is dropped; `store.get` still answers it. The store's row gets it from migration `0012` (pesos), as before; the seed never set it.
- **Cache**: a save drops the cached store and the catalog's tag, which still holds the all-articles cover's description read out of the store's texts.
- **Not done, by decision**: the stale-save refusal and the currency change with its warning (both dropped on 2026-11-18); the footer's story stays code.

## Reporting

Report this ticket in Slack as the `slack-reporting` skill describes. The skill is the only place that says which event goes to which channel and who posts it.
