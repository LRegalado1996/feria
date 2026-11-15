# LR Market brand

The identity of the product and of its first store: the name, the logo, the colors, the type and the voice. The storefront's component rules are in [`design.md` § Storefront](../../design.md); this file is what a person making a post, a sign or a new screen needs.

## Name

**LR Market.** Lucas Regalado's initials and a word that reads the same in Spanish and English, and that does not name a product: the mix changes (bubble guns and jewelry today), the name stays. Written with a space, capital L, R and M. Never "LR market", "LRMarket" or "L.R. Market". Decided by Lucas on 2026-11-13 ([FER-006](../tickets/FER-006-brand-identity.md)).

Instagram and TikTok handles: assumed available on 2026-11-13, **to be confirmed by Lucas** before the profiles are created ([FER-007](../tickets/FER-007-social-media-kit.md)).

## Logo

A price tag holding the monogram **LR**, with **MARKET** under it. Generic on purpose: it says "a shop", not "bubble guns". The letters are drawn, not set in a font, so a file looks the same on any machine.

| Version                     | Use it                                                              | Files in `public/brand/` |
| --------------------------- | ------------------------------------------------------------------- | ------------------------ |
| Full logo (tag, LR, MARKET) | 96 px tall and up: share cards, signs, posts                        | `lr-market-logo*.svg`    |
| Mark (tag, LR)              | Under 96 px, down to 24 px: site header, tab icon, home-screen icon | `lr-market-mark*.svg`    |

Each version comes in four colorways:

| Colorway             | File suffix        | Tag            | Letters       | Goes on                             |
| -------------------- | ------------------ | -------------- | ------------- | ----------------------------------- |
| Accent (the default) | none               | Volt `#c8f31d` | Ink `#111312` | Ink, chalk, white, photos           |
| Contrast             | `-contrast`        | Ink            | Volt          | Chalk, white                        |
| One color, light     | `-one-color-light` | Ink            | cut out       | Any light background, one-ink print |
| One color, dark      | `-one-color-dark`  | White          | cut out       | Any dark background                 |

In the one-color files the letters are holes: whatever is behind the logo shows through them.

**Clear space.** Leave a quarter of the logo's height free on every side. Nothing enters it: no text, no edge of the page, no other logo.

**Minimum size.** The mark, 24 px tall. The full logo, 96 px tall; below that MARKET cannot be read, so use the mark.

**Do**

- Use the files as they are, scaled in proportion.
- Pick the colorway by the background: accent by default, one color when only one ink is available.
- Put the tag on a flat color or a calm area of a photo.

**Don't**

- Recolor it outside the four colorways, or fill the tag with a gradient.
- Stretch, rotate, outline or add a shadow to it.
- Retype MARKET in a font, or move it out of the tag.
- Put the accent tag on a busy photo or on a color close to Volt.
- Draw a product (a bubble gun, a ring) into it.

### In code

The drawing lives once, in `src/lib/brand/logo.ts`. Everything else is made from it:

- `atoms/store-logo` renders it in the store tokens (`variant="full" | "mark"`, `tone="accent" | "contrast"`); the caller sets the height.
- `pnpm brand:assets` writes the eight files in `public/brand/`. A unit test fails while a file and the code disagree, so run it after changing the drawing or a color.
- `src/app/icon.tsx` (tab icon, 32 px), `src/app/apple-icon.tsx` (home screen, 180 px) and `src/app/[locale]/opengraph-image.tsx` (share card, 1200 × 630) render PNGs from the same drawing.
- `STORE_PALETTE` (`src/styles/store-palette.ts`) holds the palette for those files and images, which cannot read CSS; a test holds each value to its `--store-*` token in `src/styles/globals.css`.

## Colors

| Name  | Hex       | Token                                | Role                                    |
| ----- | --------- | ------------------------------------ | --------------------------------------- |
| Chalk | `#f2f3f0` | `store-background`                   | The page                                |
| White | `#ffffff` | `store-surface`                      | Cards, photo backgrounds                |
| Ink   | `#111312` | `store-foreground`, `store-contrast` | Text (16.7:1 on chalk), inverted bands  |
| Volt  | `#c8f31d` | `store-accent`                       | The one loud color; ink on it is 14.5:1 |

Small supporting text is a gray mixed from ink and chalk (`store-muted`, about `#5a5f5b`, 5.9:1 on chalk).

- Volt is a fill, or large text on ink. Never text on chalk or white: it cannot be read there.
- One accent, the same all year. There is no festive palette: the fair is said with words and photos, not with a second color.
- No gradients, glows or glass.

## Type

| Face  | Use                                      | Rules                                                     |
| ----- | ---------------------------------------- | --------------------------------------------------------- |
| Anton | Headlines, prices, article names, badges | Always uppercase and tight; never a sentence of body copy |
| Geist | Everything else                          | Sentence case; 400 to 700                                 |

Both are free Google fonts, loaded by the site through `next/font`.

## Voice

Direct and close, like the person behind the stall. Short sentences. Say what to do and what happens next.

**Spanish** is Rioplatense and speaks of _vos_: "elegí", "agregá", "pedí". Never _tú_ or _usted_.

| Do                                         | Don't                                         |
| ------------------------------------------ | --------------------------------------------- |
| Elegí, agregá al carrito y dejá tu nombre. | Seleccione los productos que desea adquirir.  |
| Nos vemos en la feria.                     | ¡¡No te pierdas nuestras increíbles ofertas!! |
| Bajó de precio.                            | Oportunidad imperdible por tiempo limitado.   |

**English** is plain and friendly, for a visitor from abroad: contractions are fine, slang is not.

| Do                                         | Don't                                         |
| ------------------------------------------ | --------------------------------------------- |
| Pick, add to the cart and leave your name. | Please select the items you wish to purchase. |
| See you at the fair.                       | Don't miss our AMAZING deals!!!               |
| Price drop.                                | Unbeatable limited-time opportunity.          |

In both: headlines in Anton are uppercase by the typeface, so write them in sentence case and let the style do it. No exclamation chains, no emoji in the interface, prices always with their currency.
