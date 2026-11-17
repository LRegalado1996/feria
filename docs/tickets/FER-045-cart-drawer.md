# FER-045 The cart as a side panel, a gallery that goes round

- **Milestone:** M4 Storefront and orders
- **Priority:** P0
- **Status:** in progress
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

## Reporting

Report this ticket in Slack as the `slack-reporting` skill describes. The skill is the only place that says which event goes to which channel and who posts it.
