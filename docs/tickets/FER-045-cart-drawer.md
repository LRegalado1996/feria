# FER-045 The cart as a side panel, a gallery that goes round

- **Milestone:** M4 Storefront and orders
- **Priority:** P0
- **Status:** done
- **Depends on:** FER-026, FER-039, FER-024 (stacked after FER-011)

## Goal

Adding an article feels like something happened: the cart slides in from the right with everything in it, the way https://landonorris.store's bag does, and the order is one tap away. The article's photos go round forever, like the reference's.

Asked by Lucas on 2026-11-18 after going through the store by hand: "give it more emotion when you add something; make a sidebar appear with everything in the cart; add some effects so it looks good and modern". We take that site's structure and feel, never its logo, photos or licensed typeface.

## Scope

**The cart becomes a side panel**

- Adding an article to the cart opens a panel that slides in from the right, over a dimmed page, showing the whole cart.
- The panel holds a title with the number of units; each line with its photo, name, unit price, a quantity stepper and a remove control; the total; a primary button "Hacer el pedido" / "Place the order"; a "Seguir comprando" / "Keep shopping" control that closes it. Empty, it says so and offers the catalog.
- Effects, tasteful and quick: the panel slides and the page dims; the line just added is marked for a moment (a brief highlight or a small rise); the header's cart count bumps. Only transform and opacity animate. Under reduced motion nothing slides or bumps: the panel simply appears. Nothing moves on its own for more than five seconds (`design.md` § Motion).
- The cart icon in the header opens the same panel. It stays a real link to the checkout page, so it works before the page's script loads and for visitors without script.
- "Hacer el pedido" leads to the existing page where the shopper fills in their details (name, mobile, note). That page is now the checkout: the order's summary (the lines, read-only quantities are fine, with a way back to edit them in the panel) and the form. Everything FER-026 built stays: prices re-read from the shop, the flags for a changed price, a sold-out or removed article, the order held while prices load or fail, the request key, the limits. The panel shows the same flags on its lines.
- Accessibility: the panel is a modal dialog with a title; it traps focus, closes on Escape, on the dimmed area and on its close button, and returns focus to what opened it. What adding did is announced politely. Targets are 44 px. No sideways scroll at 375 px, where the panel takes the full width.
- It works on every store page: the panel lives in the store's frame, so it opens from the article page and from the header anywhere.

**Article page**

- The photo gallery loops: going right goes round forever. With one photo there are no controls to move it. The keyboard, touch and the zoom stay.
- The share button leaves the article page (the catalog pages lose theirs in a parallel branch; the component stays).
- Everything else on the article page stays as it is, the festive band and the related row included.

## Out of scope

The header's navigation, the catalog pages, the footer, the seed and the article's `position` (a parallel branch). Changing the checkout page's address.

## Acceptance criteria

- E2E: adding from the article page opens the panel with that line; a quantity changed and a line removed in the panel; the header's icon opens it; Escape and the dimmed area close it and return focus; "Hacer el pedido" reaches the checkout and an order is placed end to end; with scripts off, the cart icon leads to the checkout page; the gallery goes past its last photo to the first.
- The panel and the checkout hold at 375 px and on a computer without sideways scroll.
- Proof: the panel just after adding, with three lines and empty, the checkout page and the gallery on its second photo, at 1440×900 and 390×844, beside the reference's drawer.

## Outcome

- **The panel** (`organisms/store-cart-panel`): every store page's frame (`organisms/store-frame`) wraps its bar, header and page in it, so it opens from the article's "Agregar al carrito" and from the header's cart on any store page, the not-found and error pages included; `useCartPanel()` (`src/lib/hooks/cart/use-cart-panel.ts`) opens it, and is `null` outside a frame (the header on `/design`). A Radix modal dialog in place, from the right, 480 px from `sm` and the whole width on a phone, the window's height: a moss bar with "Tu carrito (3)" in lime (named "Tu carrito, 3 unidades") and "Cerrar ×"; after an add, a grey line saying what it did ("Agregaste Collar dorado al carrito."), a polite live region filled once the panel is on the page; the lines; a moss foot with the total, "Hacer el pedido" as the lime pill (a link to the checkout page) and "Seguir comprando". Empty, "Tu carrito está vacío." and "Ver el catálogo". The same flags as the checkout on its lines; a gone or sold-out line turns "Hacer el pedido" into a disabled button described by why.
- **Effects** (`src/styles/globals.css`): the panel slides in (300 ms) as its scrim fades in, and both leave in 200 ms; the line just added rises 12 px under a lime wash that fades within two seconds; the title's count bumps when adding opened it or a quantity grows, and the header's badge bumps when it shows more than it last showed in sight (at once, or as the panel that covered it closes; never for the count read as the page opens). Transform and opacity only. Under reduced motion nothing runs: the panel appears and leaves at once, no wash, no bump.
- **Focus and keys**: focus starts on "Cerrar" and stays inside; Escape, the scrim, "Cerrar" and "Seguir comprando" close it and focus goes back to what opened it (the add button, the header's cart, the checkout's "Editar el carrito"); taking out a line moves focus to the line in its place, else to "Ver el catálogo", and says what was taken out. Following a link inside closes it at once, without the slide, since the page left behind stays mounted and hidden, where an exit animation never ends; a link to the page already open ("Hacer el pedido" on the checkout) only closes it.
- **The header's cart** (`molecules/store-cart-button`) stays a link to `/cart`: before the script runs and without it, it is the checkout page; once React owns it, a plain click opens the panel (`aria-haspopup="dialog"`), and a click that opens a new tab follows the link.
- **The checkout** (`organisms/store-checkout`, at `/cart`, renamed from `organisms/store-cart`): "Tu pedido", the summary read only ("2 × $ 1.200" and the line's total, the flags), "Editar el carrito", which opens the panel over the page, the total and the form. Everything FER-026 built holds, in both: the prices re-read from the shop, the flags, the order held while prices load or fail and while a line cannot be bought, the request key, the limits. The shared logic is `useCartLines` (`src/lib/hooks/cart/use-cart-lines.ts`); `useCartProducts` now shows the newest answer about another cart while a grown cart's own loads, so the panel opened by an add shows the lines it had at once and the new one as a placeholder the shape of a line (`aria-busy`).
- **Gallery** (`molecules/store-gallery`): Embla's `loop`, so the round arrow always leads on, past the last photo to the first, and the arrow keys and a finger go round both ways; one photo has no arrow and no counter, its zoom stays. The share button left the article's page; once FER-044 took it off the catalog's too, nothing rendered `molecules/store-share-button`, so it was deleted with its words. The article's trail is the catalog pages' (`molecules/store-breadcrumb`, FER-044): the home a house, then "Catálogo" (it said "Todos los artículos"; the header's word since FER-044), the group, the category and the article itself, as its structured data lists them.
- **E2E** (`src/e2e/tests/store/cart-panel.e2e.ts`): adding opens the panel with the line marked and the effects running; a quantity changed and a line taken out; the header's cart opens it on another page and Escape gives focus back; the scrim gives focus back to the add button; "Hacer el pedido" reaches the checkout and an order is placed end to end; "Editar el carrito" on the checkout; the whole width and 44 px targets at 375 px; reduced motion; the checkout page with scripts off. `article.e2e.ts` covers the gallery going round both ways, one photo and no share button; `checkout.e2e.ts` and the specs that added from an article's page follow the panel.
- **Docs**: `design.md` § Storefront (the panel, the cart button, the line, the checkout, the gallery, the motion), `docs/project/overview.md`, `docs/agents/nextjs.md`, FER-026.

## Reporting

Report this ticket in Slack as the `slack-reporting` skill describes. The skill is the only place that says which event goes to which channel and who posts it.
