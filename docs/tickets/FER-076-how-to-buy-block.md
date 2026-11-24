# FER-076 "Cómo comprar" as a block of the home

- **Milestone:** M4 Storefront and orders
- **Priority:** P1
- **Status:** done
- **Depends on:** FER-058, FER-060

## Goal

How to buy only existed as a picture in the cover's carousel: a search engine and a screen reader read nothing of it, and it could not be translated. It becomes a block of the page, in code.

## Decision

2026-11-24, Lucas, the words:

- "Comprá en 3 pasos"
- 01 "Elegí": "Mirá el catálogo en la web."
- 02 "Agregá al carrito": "Dejá tu nombre y tu celular."
- 03 "Coordinamos la entrega": "Retirás en el puesto o te lo mandamos."
- "Pagás con": Efectivo · Tarjetas de crédito y débito · Mercado Pago · Transferencia bancaria
- A button to the catalog.

Taken while building, for Lucas to confirm:

- It is a **section kind**, `how_to_buy`, not a fixed part of the home: the admin adds it to any page with "Agregar bloque", moves it with the order's arrows and takes it out, at most once per page. Added, it goes first, right under the cover.
- It is never added by itself, not even on the home, whose other rows are: after the deploy the home shows it only once it is added in `/admin/home`. The development seed places it first.
- Its words are interface text (`src/content/{es,en}/storefront.ts`), the same on every page, not edited from the admin. English was written here.
- Dark, like the article spotlight: on the moss, lime title and figures. The development seed moves its spotlight from under the cover to after the bubble guns' row, so two dark blocks never touch.
- A home with nothing to sell (no banner, no published article) still introduces the store: "how to buy" alone does not count as something to show.
- No structured data of its own: Google retired the how-to rich result.

## Scope

- `PAGE_SECTION_KINDS` and `UNTARGETED_SECTION_KINDS` (`src/lib/schemas/page`); migration `0028_how_to_buy_section`: the CHECK on `page_section.kind` takes the kind and the partial unique index `page_section_untargeted_once` covers it.
- `composePageSections`, `resolvePageSections` (never filled in), `molecules/store-page-sections` (its renderer), `(store)/section-lists.ts` (lists nothing).
- `molecules/store-how-to-buy`, shown on `/design`.
- `molecules/page-layout-editor` and `organisms/page-editor`: "Agregar bloque" on every page, the home included; a block is removable exactly when it can be added back.
- The seed (`src/server/db/seed-home.ts`), `design.md`, `docs/project/data-model.md`.

## Deploy

The migration loosens one check and rebuilds one partial unique index with a wider predicate, on a table of a few dozen rows, in the migration's own transaction. The previous build, still serving while it runs, writes only the kinds it knows, which both still accept: safe to run before the new build. Rolling the build back after the block was added to a page is the one thing to watch: the old build would read that row as a curated row, so take the block out in the admin first.

## Acceptance criteria

- The admin adds "Cómo comprar" to the home, sees it first in the order and in the preview, saves, and the storefront shows it right under the cover; taken out and saved, it leaves.
- It is real text in both languages, in the first response for a crawler that runs no script: a heading, an ordered list of three steps, a list of the ways to pay and a link to the catalog in the page's language.
- On a 360 px phone the steps stack and the page never scrolls sideways; on a computer they sit side by side.
- A page holds it at most once: the schema refuses two, and so does the table.

## Reporting

Report this ticket in Slack as the `slack-reporting` skill describes. The skill is the only place that says which event goes to which channel and who posts it.
