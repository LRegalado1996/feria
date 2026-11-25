# LR Market brand

The identity of the product and of its first store: the name, the logo, the colors, the type and the voice. The storefront's component rules are in [`design.md` § Storefront](../../design.md); this file is what a person making a post, a sign or a new screen needs.

## Name

**LR Market.** Lucas Regalado's initials and a word that reads the same in Spanish and English, and that does not name a product: the mix changes (bubble guns and jewelry today), the name stays. Written with a space, capital L, R and M. Never "LR market", "LRMarket" or "L.R. Market". Decided by Lucas on 2026-11-13 ([FER-006](../tickets/FER-006-brand-identity.md)).

Instagram and TikTok: `lrmarket` on both, chosen by Lucas on 2026-11-14 and linked from the coming-soon page. The links live in `src/lib/brand/social.ts`; the profiles themselves are created in [FER-007](../tickets/FER-007-social-media-kit.md), so check they resolve before launch.

## Logo

A price tag holding the monogram **LR**, with **MARKET** under it. Generic on purpose: it says "a shop", not "bubble guns". The letters are drawn, not set in a font, so a file looks the same on any machine.

| Version                     | Use it                                                                                         | Files in `public/brand/` |
| --------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------ |
| Full logo (tag, LR, MARKET) | Everywhere the brand shows: the site's header and footer, the admin, share cards, signs, posts | `lr-market-logo*.svg`    |
| Mark (tag, LR)              | Only where the full logo cannot fit: the browser tab icon and the home-screen icon             | `lr-market-mark*.svg`    |

Decided by Lucas on 2026-11-16 ([FER-039](../tickets/FER-039-storefront-redesign.md)): the full logo is the brand's face, even small.

Each version comes in four colorways:

| Colorway             | File suffix        | Tag            | Letters       | Goes on                             |
| -------------------- | ------------------ | -------------- | ------------- | ----------------------------------- |
| Accent (the default) | none               | Volt `#c8f31d` | Ink `#15160f` | Ink, moss, white, photos            |
| Contrast             | `-contrast`        | Ink            | Volt          | White, the grey tile                |
| One color, light     | `-one-color-light` | Ink            | cut out       | Any light background, one-ink print |
| One color, dark      | `-one-color-dark`  | White          | cut out       | Any dark background                 |

In the one-color files the letters are holes: whatever is behind the logo shows through them.

**Clear space.** Leave a quarter of the logo's height free on every side. Nothing enters it: no text, no edge of the page, no other logo.

**Sizes.** The full logo, 40 px tall at the least: the site's header on a phone (40 px), on a computer (50 px), its footer (62 px). The mark, 24 px tall at the least, as an icon only.

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
- `src/lib/brand/icons.ts` renders the icons from the same drawing, each served by a route at an address no deploy changes (search engines fetch an icon on a slow crawl of their own and want a stable URL, in a square whose side is a multiple of 48 px): `/favicon.ico` (48 px, the mark, in an ICO file: crawlers ask for it by default), `/icon.png` (tab icon, 96 px, the mark on nothing) and `/apple-icon.png` (home screen, 180 px, the mark on moss), declared in the root layout's `metadata.icons`. Not Next's `icon.tsx` convention, whose URL carries a query hashed from the file, new with every edit of it.
- `src/app/[locale]/opengraph-image.tsx` (share card, 1200 × 630, the full logo on moss) renders from it too. A store page that declares its own `openGraph` loses the card Next adds by itself, so it names it again with `defaultShareImage()` (`src/lib/seo/share-card.ts`) unless it has a picture of its own (an article's photo, a category's cover).
- `STORE_THEME` (`src/styles/theme.ts`) is the palette, the one place it is set (FER-038): the root layout writes it into the `--store-*` CSS variables, and those files and images, which cannot read CSS, import it. Its test holds every pair the storefront sets text in to WCAG AA.

## Colors

Chosen by Lucas on 2026-11-16 (FER-039): a white page, articles on a light grey tile, a moss header and footer, and Volt.

| Name  | Hex       | Token              | Role                                                                                 |
| ----- | --------- | ------------------ | ------------------------------------------------------------------------------------ |
| White | `#ffffff` | `store-background` | The page                                                                             |
| Tile  | `#f3f3f2` | `store-surface`    | Behind every article's photo, quiet fills                                            |
| Ink   | `#15160f` | `store-foreground` | Text: 18.2:1 on white                                                                |
| Moss  | `#262a1d` | `store-contrast`   | The header, the footer, the search panel; white on it is 14.7:1                      |
| Volt  | `#c8f31d` | `store-accent`     | The one loud color: the bar, the main button; ink on it is 14.1:1, it on moss 11.4:1 |

Small supporting text is a gray mixed from ink and white (`store-muted`, about `#60615c`, 6.3:1 on white).

- Volt is a fill, or text on moss (the header's links, the footer's headings). Never text on white or the tile: it cannot be read there.
- One accent, the same all year. There is no festive palette: the fair is said with words and photos, not with a second color.
- No gradients, glows or glass. A banner's photo takes no shade (FER-077): its white words carry a small text shadow of the ink so they read, legibility, not decoration.

## Type

| Face    | Use                                                     | Rules                                                                                |
| ------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Anybody | Headings, article names, navigation, buttons and labels | Variable, at 135% width and weight 800, always uppercase; never body copy or a price |
| Geist   | Prices and body copy                                    | Sentence case; 400 to 700                                                            |

Both are free Google fonts, loaded by the site through `next/font`. Anybody was chosen by Lucas on 2026-11-16 over Archivo, Mona Sans and Unbounded, and over weight 900; it replaced Anton, a condensed face.

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

In both: headings in Anybody are uppercase by the style, so write them in sentence case and let the style do it. No exclamation chains, no emoji in the interface, prices always with their currency.
