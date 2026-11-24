# FER-078 A footer with everything a small shop's footer should have

- **Milestone:** M4 Storefront and orders
- **Priority:** P1
- **Status:** in progress
- **Depends on:** FER-014, FER-044, FER-076, FER-079

## Goal

The store's footer said who made the store and little about how to reach it. A shopper looks there for four things: how to buy, how to pay, how to contact the shop and where it is.

## Decision

2026-11-24, Lucas: the footer carries what a small shop's footer should; what is the store's own (its number, its socials, its address) comes from the store's settings, never from the code.

Taken while building, for Lucas to confirm:

- Four blocks, as before, so the layout that fits 360 px and spans 1440 px is kept: the logo and Pepe's story; "Tienda"; "Ayuda"; "Contacto". "Seguinos" is gone: Instagram and TikTok are in "Contacto" with WhatsApp.
- "Ayuda": how to buy in one line (the "how to buy" block's three steps) and "Pagás con" over the ways to pay, the block's own list. The catalog link stays in "Tienda".
- "Contacto": where the store is, then WhatsApp, Instagram and TikTok, each only when the store has it. The WhatsApp link shows the number as people here write it (`099 123 456`); a number of another country shows as stored.
- **One new setting**, optional and in both languages: "Dónde encontrarnos", one short line of up to 200 characters ("Feria Paseo del Prado · Puesto 86 · Av. Delmira Agustini, rambla del Prado · Desde las 18 h"). It is free text, shown in the footer and nowhere required. Written in one language only, the other language's pages show that line, marked with its language.
- Pepe's story stays as it is: it is Lucas's own text in the dictionaries (FER-044) and names the stall. It is the one place the code still says "puesto 86".

## Scope

- `store_translation.location` (migration `0029_store_location`: a nullable column and a length check), `updateStoreSchema`, the settings form's schema and its two fields in "Contacto y redes", `findStore` and `updateStore`.
- `organisms/store-footer`, `(store)/store-page-footer.tsx` (`storeLocation`), `formatLocalPhone` (`src/lib/utils/phone.ts`), the copy in `src/content/{es,en}/`.
- `design.md` (§ Admin: settings; § Storefront: the footer), `docs/project/data-model.md`.

## Deploy

The migration adds a nullable column and a check that a null passes: the previous build, still serving while it runs, neither reads nor writes it. A settings tab left open from before the deploy sends its texts without the field; the service then keeps the stored line instead of emptying it.

After the deploy the footer shows no place until the line is written in `/admin/settings`.

## Acceptance criteria

- The footer says how to buy in one line and lists the four ways to pay, in both languages.
- With a WhatsApp number, the footer links to its `wa.me` chat and shows the number in local format; Instagram and TikTok show only when set; with none of the three and no place, there is no "Contacto" block.
- The line written in the settings shows in the footer on the next visit, in the page's language or the one it was written in, and leaves once cleared.
- At 360 px the footer's blocks fit the page; nothing scrolls sideways.
- The footer's shop links list only categories with a published article (FER-079).

## Reporting

Report this ticket in Slack as the `slack-reporting` skill describes. The skill is the only place that says which event goes to which channel and who posts it.
