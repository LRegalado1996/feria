# FER-051 Order stepper, the order pages and an admin round

- **Milestone:** M4 Storefront and orders
- **Priority:** P0
- **Status:** done
- **Depends on:** FER-027, FER-043, FER-011, FER-045 (stacked after it)

## Goal

Anyone looking at an order knows where it is at a glance: the staff in the admin, who can also move it from the same picture, and the shopper on the order's own page. The admin's categories screen explains its icon buttons, says plainly when photos cannot be uploaded, and lets Lucas choose what the store's header shows.

Asked by Lucas on 2026-11-18, after reviewing the admin and the order page by hand; the decisions below are his. Visual references: https://landonorris.store for the storefront, Vercel's dashboard for the admin.

## Scope

**An order stepper** (a new component)

1. An order's status at a glance: circles joined by a line, a Lucide icon in each and the status's name small under it. Three steps and a detour (Lucas's choice): Recibido → Preparado → Entregado; an order that "No se pudo entregar" turns the last circle red, with an ✕ icon and that name. Steps not reached are grey, reached ones take colour as the order advances, the current one is clearly marked and carries `aria-current="step"`. It is announced as a list of steps with the current status in words; colour is never the only cue.
2. Two modes. **Interactive** (the admin): the circles are buttons that change the status, each change asked first in a confirmation dialog ("¿Pasar el pedido a Preparado?", confirm and cancel) before the existing `order.changeStatus` runs. Only the moves the order domain allows (`ORDER_MOVES`) are enabled, moving back included; the others are disabled with their reason in their accessible name and a tooltip. A stale move keeps today's handling: the CONFLICT is explained and the order read again. The detour can be chosen from the stepper. **Read-only** (the shopper's page): the same picture, no buttons.
3. Horizontal on a computer, vertical on a phone.

**The admin's order page** (`/admin/orders/{id}`)

4. The interactive stepper at the top, centered, under "Volver a pedidos", on a computer; on a phone, vertical at the bottom of the page's content, above the fixed action bar. Everything else stays as it is.
5. A button that copies the order's public link (`/orders/{token}`, in the order's language, absolute) to the clipboard, with a polite "copied" confirmation and, when the clipboard is refused, the link shown to copy by hand.

**The order's public page** (`/orders/{token}`)

6. The read-only stepper: horizontal on a computer, vertical at the bottom of the content on a phone.
7. "Seguir mirando la tienda" centered.
8. The article page's festive band (`molecules/store-article-band`, with its pause button), with clear room above and below.
9. Under the band, a row of articles from one category chosen at random, headed "Hacé todos los pedidos que quieras" ("Order as often as you like"), reusing the article row, without breaking caching or causing a hydration mismatch.

**The admin's categories screen** (`/admin/categories`)

10. Every icon-only button has a tooltip on hover and on focus saying what it does, in both languages, the same words as its accessible name.
11. Uploading a cover where the server has no `BLOB_READ_WRITE_TOKEN` fails clearly: `upload.createToken` answers a typed error, the uploader says "La subida de fotos no está configurada en este servidor" in both languages, and it is reported once, not as a crash. A real upload is checked end to end with a token set, and its test category deleted through the admin so its file goes.
12. A "Mostrar en el encabezado" checkbox for groups and categories in no group, checked for a new one (Lucas's choice); a category in a group always shows in its dropdown. The header and the phone menu list only those checked; every catalog page stays reachable. Schema change approved by Lucas: additive, default true, expand then contract. Set where the group is chosen, through the category procedures, authorized like the others.

## Out of scope

The storefront's header, phone menu, catalog grid, footer and checkout page (another branch works on them in parallel), except the header's data filter for item 12.

## Acceptance criteria

- The stepper shows each status, the detour included, with `aria-current="step"` on the current one; only allowed moves are enabled; nothing changes without confirming; the read-only stepper has no buttons. Unit tests fail when any of these rules is broken.
- E2E: an order's status changed through the stepper with its dialog, and a cancelled one; the public page's read-only stepper reflects a change made in the admin; the link copied; a category unchecked disappears from the header and keeps its page; the categories screen's tooltips on hover and on focus.
- The not-configured upload answers a typed error and shows its message, tested on both sides.
- Proof at 1440×900 and 390×844 on a production build, the admin in light and dark: the order page at each status and the detour, the dialog, the public page with the stepper, the band and the row, the categories screen with a tooltip and the checkbox, and the uploader's message.

## Decisions

- **The stepper is one molecule with two modes** (`molecules/order-stepper`): `moves` given, the circles are buttons (the admin); left out, it only shows. The storefront wears it through `molecules/store-order-stepper` (`tone="bare"` and the store's classes), as the language pill does, so no storefront style leaks into the admin.
- **The detour is a small secondary button under the last step**, "No se pudo entregar" with an ✕, rather than a last circle offering two outcomes: one circle, one meaning. It follows `ORDER_MOVES` like the circles (enabled only from Preparado) and is gone once the order took it, when the last circle itself turns red with the ✕.
- **A refused move says why in its name and its tooltip, the same words**: "Entregado: antes tiene que pasar por Preparado" (every refused move in the domain goes through Preparado). The current step says "Preparado: es el estado actual". They are `aria-disabled`, not `disabled`, so focus and the tooltip reach them.
- **The confirmation reuses `molecules/confirm-dialog`**, which gained `confirmVariant`: a move forward or back confirms with the default button ("Sí, pasar a Preparado", "Sí, volver a Recibido"); the detour keeps the destructive one and the existing words ("¿No se pudo entregar el pedido?").
- **The move buttons stay** in the top bar and in the bar under the thumb: they are the screen's main action, one tap each (FER-027's "two taps from the list"), and the stepper is the picture with a confirmed shortcut. Both call the same `onMove`, so a stale move is explained the same way ("Alguien ya cambió este pedido; lo actualizamos.") and the order is read again.
- **Two copies on each page, one per layout**: across at the top on a computer (`hidden md:block`), down at the end on a phone (`md:hidden`), so the reading order matches what each screen shows; the hidden one is out of the accessibility tree.
- **On the shopper's page the phone's stepper sits above the buttons**, at the end of the order, as the admin's sits above its bar of moves. With the store's WhatsApp, its button and "Seguir mirando la tienda" are stacked, each centered, the way back last.
- **The detour's red on the storefront is a sixth theme color, `store-danger` (`#b42318`)**, in `src/styles/theme.ts` with its contrast tested (6.6:1 both ways) and added to the storefront-style ratchet: the storefront's palette had no color for something that went wrong, and design.md bans colors outside the theme.
- **The copy-link button is in the contact card**, under WhatsApp: both are ways to reach the shopper. The link is the order's page in the language the order was placed in, on the origin the admin is open at, resolved when pressed. A refused clipboard (`NotAllowedError`, or none on an insecure page) shows the link selected in a read-only field with the reason; it is the browser's policy, so it is not reported; any other failure is. `order.get` now answers the token (admins only).
- **The row's category is drawn on the server per visit** (`pickReorderCategory`, `Math.random` after the order's request-time read): among categories with four or more published articles, else any with one. The counts and the chosen category's articles are cached reads with the catalog's tag, so nothing new is cached per visit, and the browser only shows what the server drew: no hydration mismatch. The row's "Ver todo" is named after the category ("Ver todo: Aros"), through a new `viewAllOf` on the article row.
- **Uploads not configured answer `SERVICE_UNAVAILABLE`** (503) with `why: uploads_not_configured`: a configuration problem, not a request the admin can correct, and not one of the codes the error reporting ignores, so the uploader reports it once (the server reports nothing and logs `upload.configured: false`); the uploader says so plainly and offers no retry, which cannot succeed.
- **"Mostrar en el encabezado"** shows for a group and for a category in no group; with a group chosen it gives way to a line saying a category in a group always shows in its group's menu, and the form does not send it. Hiding a group hides its categories from the header too. The procedure takes it as optional: left out (an older tab) keeps the stored choice. The header's filter is data only (`headerCategories`, applied in `store-shell.ts`); the footer, the filter panel and the catalog pages are untouched.

## Outcome

- **Stepper** (`molecules/order-stepper`, `molecules/store-order-stepper`): Recibido → Preparado → Entregado, the detour red with an ✕, `aria-current="step"` on the current step, the list named with the status in words, each step's progress said; across from `md` up, down below it. Interactive in the admin with a confirmation before every move, only `ORDER_MOVES` enabled, the others explained in their name and tooltip; read only on the shopper's page.
- **Admin order page** (`organisms/order-detail`): the stepper in a card at the top, centered, on a computer; at the end, above the moves' bar, on a phone. "Copiar el enlace del pedido" (`molecules/copy-link-button`) in the contact card.
- **Public order page** (`organisms/store-order`, `(store)/orders/[token]/page.tsx`): the read-only stepper, the buttons centered, the festive band with room above and below, and "Hacé todos los pedidos que quieras", a row of one category drawn per visit (`src/lib/catalog/reorder.ts`, `countPublishedByCategory` and `listCategoryArticles` behind `readCategoryCounts` and `readCategoryArticles`).
- **Categories screen**: every icon-only button (drag, up, down, page and group, rename, delete) shows its name in a tooltip on hover and on focus; the not-configured upload says "La subida de fotos no está configurada en este servidor"; "Mostrar en el encabezado" (migration `0016_wise_skin`: `category.showInHeader boolean not null default true`, additive) with the header and the phone menu listing only those checked.
- **Real upload, 2026-11-17**: with this worktree's token, on a local production build, a test category's cover went to `feria-images-qa` (`local/cover/…webp`, HEAD 200), showed on its page, and deleting the category through the admin removed the file (HEAD 404 within 12 s). A second test category left by a failed first run of the script was deleted the same way, its file gone too. With the token unset, `upload.createToken` answered 503 with the request's log line saying `upload.configured: false` and no error-level line, and the uploader showed its message.
- **Tests**: unit tests for every new and changed file, each rule broken once and seen red (the moves allowed, no move without confirming, read only without buttons, `aria-current`, the detour's place, the copied URL whole and in the order's language, the draw, the band's margin, the token read); E2E `tests/admin/order-stepper.e2e.ts` (a move cancelled and confirmed through the dialog, the detour, the shopper's page following, the centered button and the band, the link copied, the phone's layout), `tests/admin/category-header.e2e.ts` (unchecked, gone from the phone menu and the header, its page still there), the tooltips in `tests/admin/categories.e2e.ts`; the order page's specs in `checkout.e2e.ts` and `cart-panel.e2e.ts` read the order's lines by their section.
- **Docs**: `design.md` (§ Components, § Admin: the stepper, the order page, the categories screen; § Storefront: `store-danger`, the order page), `docs/project/data-model.md`, `docs/agents/security.md`, `docs/agents/observability.md`.

## Reporting

Report this ticket in Slack as the `slack-reporting` skill describes. The skill is the only place that says which event goes to which channel and who posts it.
