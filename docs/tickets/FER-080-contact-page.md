# FER-080 A contact page

- **Milestone:** M4 Storefront and orders
- **Priority:** P1
- **Status:** done
- **Depends on:** FER-076, FER-078

## Goal

A shopper who wants to ask something has one place to go: a page with how to reach the store, that looks like the store.

## Decision

2026-11-24, Lucas: "a contact page that looks good and has the contact details."

Taken while building, for Lucas to confirm:

- Its address is `/contacto` (`/en/contacto` in English), a page of the site, not one made in the admin: it reads the store's settings, so it is right the moment they are saved, and there is nothing to keep in step by hand.
- Everything about the store comes from `/admin/settings`: WhatsApp (the page's main action, the number shown as `099 123 456`), Instagram, TikTok and "Dónde encontrarnos", each only when set. How to buy and the ways to pay are the "how to buy" block's own words. Nothing about this store is written in the code.
- A store with no contact data at all still has the page: it says the details are not loaded yet and offers the catalog. No empty box is drawn.
- The footer links to it from "Ayuda" ("Página de contacto"), in both languages, always: the footer's own "Contacto" block shows only when the store has contact data, and the page exists either way. It is not in the header.
- `contacto` becomes a word of the site, like `productos`: no category, group or page made in the admin can take it (a category named "Contacto" gets `contacto-2`). Migration `0030_reserve_contact_address` renames a category or a page that already holds it to the first free `contacto-2`, `contacto-3`…. The local store holds none; QA and production were not looked at, and the migration covers them either way.
- No contact form: the store answers on WhatsApp, and a form would need somewhere to send its messages and a guard against spam.

## Scope

- `CONTACT_PATH` (`src/lib/catalog/paths.ts`), `RESERVED_CATEGORY_SLUGS`, migration `0030` with its replay test.
- `src/app/[locale]/(store)/contacto/page.tsx`: the route, read per request before anything is sent, behind no boundary, with its metadata (title, description, canonical, `hreflang`) and structured data (`Organization` with `contactPoint` and `sameAs`, `BreadcrumbList`).
- `organisms/store-contact`, the copy in `src/content/{es,en}/storefront.ts` (`contact`).
- `organisms/store-footer` (the link), `src/app/sitemap.ts`, `src/lib/seo/llms.ts`, `storeOrganization` (`src/lib/seo/structured-data.ts`).
- `design.md`, `docs/agents/nextjs.md`.

## Deploy

The migration only renames rows that hold `contacto`, and only if there are any. The previous build, still serving while it runs, could still create one in that window; the contact page then wins over it until the row is renamed by hand.

The migration takes each such store's category lock (the one a category or a page takes before it picks its address) before it renames, so a category being created at that moment cannot take the `contacto-2` a page is renamed to.

After the new build is live, check each environment once; this must answer no row:

```sql
SELECT 'category' AS kind, id FROM category WHERE slug = 'contacto'
UNION ALL
SELECT 'page', id FROM page WHERE slug = 'contacto';
```

A row there was written by the old build during the deploy. The rename stays a migration and not a post-cutover repair script (`docs/agents/database.md` § One-shot data repairs) because the rows that can exist are the ones already there when it runs, as with `0015` (FER-043); the window needs the store's one admin to create a category or page named "Contacto" during the minutes of a deploy, on a store that has not opened.

## Acceptance criteria

- `/contacto` and `/en/contacto` answer 200 with the page in each language, its own title and description, its canonical address and its twin.
- With WhatsApp set, the main action opens the `wa.me` chat and shows the number in local format; Instagram, TikTok and the place show only when set.
- With no contact data, the page says so and offers the catalog, and draws only the "how to buy" tile.
- A crawler that runs no script reads the contact details in the first response.
- Two columns on a computer, one on a 360 px phone, and the page never scrolls sideways.
- The footer links to it in both languages; the sitemap and `llms.txt` list it.
- A category or a page cannot take the address `contacto`.

## Reporting

Report this ticket in Slack as the `slack-reporting` skill describes. The skill is the only place that says which event goes to which channel and who posts it.
