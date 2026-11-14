# Design guidelines

The craft layer for every user-facing surface. `AGENTS.md` wins where it rules (component contract, definition of done, testing); this file wins over the generic `frontend-design` and `web-design-guidelines` skills. Rules name a reference implementation when one exists. Read it before UI work.

## Philosophy

Two people use this product, and neither is at a desk. A **fair shopper** stands at a street stall holding a phone in one hand, on mobile data, often in sunlight: they scan a QR code or open a link sent by WhatsApp, look for an article, check its price and order it with a name and a phone number. A **store owner** loads articles from the same kind of phone, between customers: photos first, then a few fields, and it has to take under a minute. Later they check the orders that came in. Design for those two jobs, phone first: one thumb, large targets, the price and the next step in the first viewport, nothing that needs a hover or a second hand. Precise, calm, honest; confidence through clarity, never decoration. When requirements compete, protect in order: correctness of displayed facts (a polished screen with a wrong value is a defect) → the browser floor and the system → the user's task → consistency → composition → polish.

Answer first, records below; one claim, one home. Ask only when the answer changes meaning (amounts, states, permissions); visual craft is settled here.

**Process.** Frame the job (who, deciding what, which edge state changes it; never invent data). Choose the composition: the first viewport is the task, tables for lookup, charts only when a relationship reads faster; blurred or with the words masked, the hierarchy still reads. Build with the system. Inspect in light and dark, at 375 px and desktop, against the definition of done.

## Foundations

**Tokens.** `src/styles/globals.css` is the API (Tailwind 4, CSS-first). Use utilities or `var()`; never a hex/`oklch()`/`hsl()` literal in a component, a parallel token, or an ad-hoc restyle of a shadcn primitive. Roles: `background`/`foreground` canvas; `card`/`popover` raised surfaces; `primary` the one emphasized action per view; `secondary`/`muted`/`accent` quiet fills, `muted-foreground` captions; `destructive` danger and errors; `border`/`input`/`ring` boundaries and focus; `chart-1…5` the only series colors.

Radius `rounded-md` controls, `rounded-lg` cards and dialogs. Shadows by role: `shadow-xs` controls, `shadow-sm` cards, `shadow-lg` overlays. Fonts only through `next/font` in `src/app/[locale]/layout.tsx`. Both themes are first-class: every color recipe carries its `dark:` half.

**Browser floor.** Tailwind 4's: Chrome/Edge 111, Safari 16.4, Firefox 128; its colors need `oklch()` and `color-mix()`. SWC transpiles syntax but never polyfills built-ins, and browserslist doesn't police methods: check a built-in (`Object.groupBy`, `Promise.withResolvers`, iterator helpers) against the floor. Verify floor-sensitive changes on `pnpm build` output, not dev. An older floor is a project decision with its own CSS fallback pipeline and a test.

## Typography and copy

| Role                    | Classes                                                   |
| ----------------------- | --------------------------------------------------------- |
| Page title              | `text-2xl font-bold`, the single `h1`                     |
| Decisive value          | `font-semibold tabular-nums`; `font-mono` for identifiers |
| Body                    | `text-sm`                                                 |
| Prose; inputs on mobile | `text-base`                                               |
| Caption, helper, badge  | `text-xs text-muted-foreground`                           |

No arbitrary sizes or off-scale weights; text that doesn't fit is rewritten or reflowed, never shrunk. Aligned figures are `tabular-nums`, right-aligned, peers at equal precision. Numbers, prices and dates go through `src/lib/utils/format.ts`, which owns the time zone (the store's, `America/Montevideo`) and the cached `Intl` instances; every formatter takes the page's locale as an argument, and components never build `Intl.*` or call `toLocaleString()`. A price names its currency: `$ 1.290` and `US$ 12,50` in Spanish, `UYU 1,290` and `USD 12.50` in English, cents only when the amount has any.

**Two product languages: Spanish by default, English behind a toggle**, in the storefront and the admin alike. The URL decides: no prefix is Spanish, `/en/...` is English, and `<html lang>` follows it. No interface text is written in a component: every string, hidden ones included (sr-only labels, `aria-label`, placeholders, toasts, validation messages), lives in `src/content/{es,en}/` and reaches the screen through `getDictionary(locale)` or `useDictionary()`, so both languages always have it (`docs/agents/i18n.md`). Spanish uses the Rioplatense voseo ("Probá de nuevo"). The locale toggle (`molecules/locale-toggle`) names the language it leads to, in that language, and keeps the path and the query string. Code, comments, commits and test titles are always English. Sentence case; no all-caps eyebrows (the storefront has one: § Storefront). Headings state the task or fact; a toast says what happened. Never show raw `error.message`, enum values or schema field names.

## Color and surfaces

Monochrome first. Color encodes state, action or data, always with a non-color cue. Earned color uses these recipes only:

- Status chip: `bg-{hue}-100 text-{hue}-800 dark:bg-{hue}-950 dark:text-{hue}-300`.
- Tinted panel: `border-{hue}-200 bg-{hue}-50 text-{hue}-900 dark:border-{hue}-900 dark:bg-{hue}-950/30 dark:text-{hue}-100`.
- Good/bad (not up/down): `text-emerald-600 dark:text-emerald-400` / `text-red-600 dark:text-red-400`.
- Hues: amber attention, red error or blocking, emerald success, blue information. Text on a colored fill gets its AA ratio in a comment.

**Environment identity.** Every non-production deployment carries `molecules/environment-marker`: a 2px top line and a chip naming the environment, never color alone. Production carries nothing; a bare edge means the real thing.

One canvas: a card or border must express interaction, selection, warning or a grouping spacing can't. No cards in cards. Busy: remove content. Loud: less color, weight and borders. **Hard rejects:** decorative gradients, gradient text, glows, textures, glass (`backdrop-blur` on translucent fills), colored side rails, ornamental shadows.

## Layout and responsive

- One page container per shell; constrain blocks, not the page (forms `max-w-sm`, as the sign-in view in `src/app/[locale]/page.tsx`).
- Mobile-first. Grid/flex children get `min-w-0` (`atoms/input`); so does a `<fieldset>`. The page never scrolls sideways: wide content scrolls in its own `overflow-x-auto` box, with `overflow-y-clip` to avoid a phantom vertical bar.
- Toolbars `flex-wrap`; titles `truncate` on a block element. Unbounded user text never sits in a `whitespace-nowrap` control. `sticky` binds to the nearest ancestor with any `overflow`.
- Overlays cap height with `dvh`, not `vh`. Inputs are `text-base md:text-sm` so iOS doesn't zoom. Never lock zoom or orientation.

## Components

The contract is `AGENTS.md` § Components and forms. Also:

- `data-slot` on every root (a fragment gets a wrapper); `data-variant`/`data-size` where variants exist.
- **Leaf-subpath imports** (`@/app/_components/atoms/button`), never an aggregate: one heavy re-export leaks into every page's bundle.
- **Consumer or it doesn't ship:** a component, hook or helper lands with the code that uses it. Its own test makes an unrendered component look used.
- After `shadcn add`: move default strings into the dictionaries, in both languages; apply the layout rules above.
- Key lists by stable id (`kind:id` when a list mixes entities), never index. One label map per enum, `satisfies Record<…>`.
- Icons: `lucide-react` only, default stroke; `size-4` default, `size-3.5` dense, `size-6` headers, `size-12` empty states. Decorative ones get `aria-hidden`; meaningful ones a name. No icon tiles.
- References: `atoms/button` (variants, focus ring), `atoms/input`, `molecules/locale-toggle` (a link styled as a button, `lang` on its label), `molecules/form` (`FormControl` wires `aria-invalid`/`aria-describedby`), `molecules/post-card` (`PostCardSkeleton` mirrors the card), `molecules/row-actions` (icon-only trigger named after its row, tooltip), `molecules/confirm-dialog` (destructive confirm, focus returned on close), `src/lib/hooks/post/use-create-post.ts` and `use-delete-post.ts` (optimistic update, rollback).

## Data

**Four distinct states:** pending (skeleton with the real geometry, `aria-busy`), error (`role="alert"` plus retry when it can succeed), empty (a short sentence and optionally the action that fills it), data. A failed query never renders as empty or zero. Spinners only for unknown-length inline waits; no "Loading…" text.

- Keep the previous result while the next page or search loads (`placeholderData: keepPreviousData`); never unmount what the user is aiming at.
- Tables: numeric headers align with their values; `aria-sort` on sortable headers; totals in `<tfoot>`; paginated lists sort on the server with an `id` tiebreak.
- Charts: `--chart-*` colors, the shared formatter, no animation under reduced motion, exact records reachable.
- Native controls first (`<input type="date">`). Shortcuts are stored as `Mod+K`-style tokens, rendered by one formatter.

## Interaction, forms and feedback

**Forms:** `<Form>` + react-hook-form + `zodResolver`; `Field` for layout only, ids wired by hand.

- **Never discard typed input.** Reset only on success (`onSuccess`, or after `mutateAsync` resolves); a failure keeps the text and says why. Never silently clamp or default.
- After a save, `form.reset(storedRow)` and key the form by entity: react-hook-form ignores new `defaultValues`.
- An error on a hidden tab or step brings the user to it; `noValidate` so zod owns messages.
- **Numeric inputs** hold `number | null` and emit `null` when cleared; callers use `?? current`, never `?? 0`; the schema rejects empty before coercing; the decimal separator follows the page's language (a comma in Spanish, a dot in English).
- **Narrow Radix values:** `onValueChange` returns any string. `safeParse` it and ignore unknowns and the `""` echo.
- Never ask users to type internal ids; don't prefill fields that decide money or dates.

**Every action answers.** Pending: `disabled` and a progressive label ("Saving…"). Every outcome is visible (toast or inline `role="alert"`), success only after it happened. Destructive actions confirm in a dialog; dangerous ones add a typed phrase. A toast is for the user; reporting is separate (`AGENTS.md` § Error reporting). Success effects go in `onSuccess`: `onSettled` runs on failure too, and `mutate()` callbacks wait for it.

**Focus after close.** When a dialog or popover closes, focus lands on the trigger or the next likely control; a controlled dialog without a trigger sets it in `onCloseAutoFocus` (or `onOpenChange` when the exit delay matters). Auto-focus never fires on a timer while `document.activeElement` is editable. Never remove a focus ring without an equivalent.

**Tooltips over `title`.** The name stays on `aria-label`; the tooltip repeats it. A disabled button sits inside a `<span>` trigger so the tooltip explaining why still shows.

## Motion

Stillness by default. Approved: `animate-spin`/`animate-pulse` for waiting, Radix open/close via tw-animate-css at 150–300 ms (200 default), `transition-colors`. Reduced motion per driver: CSS with `motion-reduce:`, JS with the library's hook. Under reduced motion, drop overlay exit animations instead of slowing them: Radix unmounts an overlay when its exit animation ends, and one that never ends leaves an invisible layer eating clicks. Never scroll-reveal, parallax, marquees, bounce or sound; the storefront reveals on scroll and has one marquee (§ Storefront).

## Storefront

The public store speaks another visual language than the admin: editorial, loud and fast, for a shopper deciding in seconds (the Volt language, `docs/project/overview.md`). Everything above still holds there except what this section changes. The admin changes nothing: it keeps the calm back-office rules.

**Where it applies.** Storefront components are the `store-*` directories of the three component tiers; the `storefront-style-outside-storefront` ratchet (`scripts/ratchets.json`) fails any storefront utility used anywhere else. Its one excluded route is the `/design` gallery, and the list cannot grow: CI checks the baseline against the rule as it is on the base branch, so a widened exclude fails. A storefront route therefore holds no storefront style of its own. A store's pages (`src/app/[locale]/[store]/`) render `store-*` organisms: `organisms/store-theme` carries the palette, `organisms/store-intro` the home's content. `/design` shows every storefront component in both languages and answers 404 in production: check a storefront change there at 375 px and 1280 px.

**Colors.** Five tokens, the LR Market palette by default; a store overrides them on its own pages and nothing else. The store layout wraps its pages in `organisms/store-theme`, which writes the store's five colors as CSS variables on one element, the only place a color comes from data instead of a token:

| Token              | Default   | Role                                           |
| ------------------ | --------- | ---------------------------------------------- |
| `store-background` | `#f2f3f0` | The page                                       |
| `store-surface`    | `#ffffff` | Cards and panels on the page                   |
| `store-foreground` | `#111312` | Text; 16.7:1 on the background                 |
| `store-contrast`   | `#111312` | Inverted blocks and bands, the regular price   |
| `store-accent`     | `#c8f31d` | The one loud color; foreground on it is 14.5:1 |

`store-muted` (small text on the background, 5.9:1), `store-contrast-muted` (small text on a contrast block) and `store-line` (hairlines, the surface behind a missing photo) are derived from those five with `color-mix()`, so an override never supplies them: the element that overrides the five carries `data-store-palette`, which computes the three again from its own values (a custom property is inherited as a finished color, so `:root` alone would keep the default ones). The accent is a fill, or large text on a contrast block; never text on the background or the surface, where it cannot be read. Text on the accent is `store-foreground`; text on a contrast block is `store-background`. A store's palette is refused when it is saved unless every pair above is readable (`src/lib/schemas/store`): 4.5:1 for the foreground on the background, the surface and the accent, for the background on the contrast color, for `store-muted` on the background, the surface and `store-line`, and for `store-contrast-muted` on the contrast color; 3:1 for the accent on the contrast color, which only display headings use. The storefront has no dark theme: a store's palette is its identity, so these tokens have no `.dark` value and storefront markup never uses the app tokens (`background`, `primary`, `muted-foreground`).

**Type.** Two faces, both through `next/font` in the root layout. The display face (Anton, `font-display`) sets headlines, prices, article names, badges and the marquee: always `uppercase` and `tracking-display`, never a sentence of body copy. A heading is `leading-display`; a one-line label on a solid block (badge, price, card name, marquee) is `leading-none`, so the block hugs the letters. Geist sets everything else, in sentence case. Display sizes are fluid utilities, not the admin's type table: `store-display-hero` (54 px on a phone to 152 px), `store-display-section` (42 to 88 px), `store-display-title` (24 to 28 px), `store-display-figure` (88 to 96 px). `store-eyebrow` is the one all-caps label in Geist. A heading breaks where its copy says (`StoreHeading` takes its lines), not where the viewport does. Corners are square: no radius on storefront surfaces or controls.

**Components.** `atoms/store-eyebrow`, `atoms/store-heading` (display heading; its lines rise one after another when the page loads, so below the fold it goes inside a `store-reveal`, which holds the rise until the block scrolls in), `atoms/store-chip` (a filter; `asChild` over the link or button that applies it), `atoms/store-badge` ("New", "Price drop"), `atoms/store-arrow-link`, `atoms/store-price-tag` (regular on the contrast color; reduced on the accent with the previous price struck through, only when it was higher), `atoms/store-reveal`, `atoms/store-count-up`, `molecules/store-article-card` (one stretched link per card; one badge, a reduced price outranks new), `molecules/store-marquee`, `molecules/store-slider` (native scroll with snap, buttons, a counter, arrow keys once focused). Touch targets are 44 px (`min-h-11`, `size-11`). Focus rings are a 3 px outline in `store-foreground`, or `store-accent` on a contrast block.

**Motion.** The storefront moves, within four rules:

- Only `transform` and `opacity` animate (and colors on hover).
- Every motion has a reduced-motion answer: CSS behind `motion-safe:`/`motion-reduce:`, scripted motion behind `usePrefersReducedMotion()`. Reduced motion shows the final state at once: the marquee wraps in place, reveals do not hide anything, the count-up shows its figure.
- The text is in the server's HTML and visible without JavaScript. Motion lives in small client components (`store-reveal`, `store-count-up`, `store-marquee`, `store-slider`) that wrap server-rendered content. `useScrollEntry()` holds back only what is still off screen after hydration, so nothing the visitor has seen blinks; what was on screen at load is not animated.
- One thing per store page moves on its own: the marquee (the `/design` gallery shows both of its tones, each with its own pause). Motion that runs longer than five seconds needs a way to stop it (WCAG 2.2.2), so the marquee carries a pause button with `aria-pressed`.

**Still banned in the storefront:** decorative gradients and gradient text, glows, glass (`backdrop-blur` on translucent fills), textures, parallax, bounce, sound, and any color outside the five tokens and their three derivations.

## Accessibility

WCAG AA in both themes. Landmarks, one `h1`, ordered headings, source order is reading order, a skip link per shell. Focus rings: controls as `atoms/button`, large regions `focus-visible:ring-2 focus-visible:ring-ring`. `aria-live="polite"` for status, `assertive` only when blocking. `role="combobox"` triggers carry `aria-controls`. Never color alone.

## Anti-patterns

A centered hero over a card grid; rows of interchangeable metric boxes; badges for ordinary metadata; borders repairing weak hierarchy; charts without a question; a narrow table stranded in a wide section. Restraint is not sterility: keep one focal point and quiet the rest.

## UI definition of done

`AGENTS.md`'s gates apply. On every interactive widget added or touched, check by hand what lint can't:

- A styled toggle has `aria-pressed`.
- The active step or page has `aria-current="step"`/`"page"`, else `undefined`.
- An icon-only control has an accessible name; in a list the name carries the row's identity ("Delete post: Weekend plans"), or screen readers and name-based locators can't tell rows apart.
- No nested interactives: one interactive element per stack, siblings otherwise.
- Never lock zoom (no `maximumScale`, no `userScalable: false`).
- A field error has an id and `role="alert"`; the control points at it with `aria-invalid` + `aria-describedby`.

Then review in order, worst systemic defect first: first read → composition → typography → evidence → restraint → themes and reflow (light, dark, 375 px, reduced motion) → trust and access.

## React and browser pitfalls

- **Hydration:** a client component's first render matches the server's: no `Date.now()`, `Math.random()`, `window` or time-zone-dependent formatting in it. Seed client state from the server; a skeleton matches its page's markup.
- **Global key handlers ignore typing:** return early for inputs, textareas, selects and contenteditable; guard `typeof e.key === "string"` (autofill sends keyless events); data-changing hotkeys do nothing while a dialog is open.
- **A modal owns Escape:** Radix closes in the capture phase, so a global handler then sees cleared state; call `stopPropagation()` in `onEscapeKeyDown`.
- **DOM handlers never throw:** a handler error skips error boundaries and hits `window.onerror`. `safeParse`, not `parse`.
- **URL state is untrusted:** parse and clamp at the point of use (`?page=0`, `?pageSize=500`); unknown enums fall back to "all"; every accepted param reaches the query. Await a deferred URL setter before navigating. Never take context from "the first row" or a stale cookie.
- **`queryFn` never resolves `undefined`:** TanStack Query v5 fails the query. Return `null` or throw NOT_FOUND (Drizzle's `findFirst` returns `undefined` on a miss).
- **Global mutation handler + local catch = duplicate toasts:** one layer owns the message; opt out through `meta`.
- **Promise-returning browser APIs need `.catch`:** `navigator.clipboard.*`, `media.play()`, `wakeLock.request()` reject under browser policy, and a sync `try/catch` around an unawaited call sees nothing.
- **Review autofixes:** destructuring can detach a method (`const { get } = searchParams` throws).

## Changing this document

Add a rule when a review theme recurs twice, at the narrowest point that holds it: a token or primitive first, then a mechanical check, prose last. Name its reference implementation once one exists. The `design-feedback` skill runs that loop over recent review comments.

**Checked mechanically** by the ratchets in `scripts/ratchets.json` (`pnpm check`), each held at zero: `raw-color-literal` (Foundations), `arbitrary-text-size` (Typography), `shadow-outside-ladder` (Foundations), `one-off-number-format` (`Intl` or `toLocaleString()` outside `src/lib/utils/format.ts`), `non-lucide-icon-import` (Components) and `storefront-style-outside-storefront` (Storefront). A failure names the rule, its guardrail here and the fix.
