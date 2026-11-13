# Design guidelines

The craft layer for every user-facing surface. `AGENTS.md` wins where it rules (component contract, definition of done, testing); this file wins over the generic `frontend-design` and `web-design-guidelines` skills. Rules name a reference implementation when one exists. Read it before UI work.

## Philosophy

Two people use this product, and neither is at a desk. A **fair shopper** stands at a street stall holding a phone in one hand, on mobile data, often in sunlight: they scan a QR code or open a link sent by WhatsApp, look for an article, check its price and order it with a name and a phone number. A **store owner** loads articles from the same kind of phone, between customers: photos first, then a few fields, and it has to take under a minute. Later they check the orders that came in. Design for those two jobs, phone first: one thumb, large targets, the price and the next step in the first viewport, nothing that needs a hover or a second hand. Precise, calm, honest; confidence through clarity, never decoration. When requirements compete, protect in order: correctness of displayed facts (a polished screen with a wrong value is a defect) → the browser floor and the system → the user's task → consistency → composition → polish.

Answer first, records below; one claim, one home. Ask only when the answer changes meaning (amounts, states, permissions); visual craft is settled here.

**Process.** Frame the job (who, deciding what, which edge state changes it; never invent data). Choose the composition: the first viewport is the task, tables for lookup, charts only when a relationship reads faster; blurred or with the words masked, the hierarchy still reads. Build with the system. Inspect in light and dark, at 375 px and desktop, against the definition of done.

## Foundations

**Tokens.** `src/styles/globals.css` is the API (Tailwind 4, CSS-first). Use utilities or `var()`; never a hex/`oklch()`/`hsl()` literal in a component, a parallel token, or an ad-hoc restyle of a shadcn primitive. Roles: `background`/`foreground` canvas; `card`/`popover` raised surfaces; `primary` the one emphasized action per view; `secondary`/`muted`/`accent` quiet fills, `muted-foreground` captions; `destructive` danger and errors; `border`/`input`/`ring` boundaries and focus; `chart-1…5` the only series colors.

Radius `rounded-md` controls, `rounded-lg` cards and dialogs. Shadows by role: `shadow-xs` controls, `shadow-sm` cards, `shadow-lg` overlays. Fonts only through `next/font` in `src/app/layout.tsx`. Both themes are first-class: every color recipe carries its `dark:` half.

**Browser floor.** Tailwind 4's: Chrome/Edge 111, Safari 16.4, Firefox 128; its colors need `oklch()` and `color-mix()`. SWC transpiles syntax but never polyfills built-ins, and browserslist doesn't police methods: check a built-in (`Object.groupBy`, `Promise.withResolvers`, iterator helpers) against the floor. Verify floor-sensitive changes on `pnpm build` output, not dev. An older floor is a project decision with its own CSS fallback pipeline and a test.

## Typography and copy

| Role                    | Classes                                                   |
| ----------------------- | --------------------------------------------------------- |
| Page title              | `text-2xl font-bold`, the single `h1`                     |
| Decisive value          | `font-semibold tabular-nums`; `font-mono` for identifiers |
| Body                    | `text-sm`                                                 |
| Prose; inputs on mobile | `text-base`                                               |
| Caption, helper, badge  | `text-xs text-muted-foreground`                           |

No arbitrary sizes or off-scale weights; text that doesn't fit is rewritten or reflowed, never shrunk. Aligned figures are `tabular-nums`, right-aligned, peers at equal precision. Numbers and dates go through `src/lib/utils/format.ts`, which owns the locale (`APP_LOCALE`, also `<html lang>`), the time zone and the cached `Intl` instances; components never build `Intl.*` or call `toLocaleString()`.

**One product language per app** (today: English; FER-004 makes it Spanish by default with an English toggle); code, comments, commits and test titles are always English. Sentence case; no all-caps eyebrows. Headings state the task or fact; a toast says what happened. Hidden strings (sr-only labels, `aria-label`) use the product language. Never show raw `error.message`, enum values or schema field names.

## Color and surfaces

Monochrome first. Color encodes state, action or data, always with a non-color cue. Earned color uses these recipes only:

- Status chip: `bg-{hue}-100 text-{hue}-800 dark:bg-{hue}-950 dark:text-{hue}-300`.
- Tinted panel: `border-{hue}-200 bg-{hue}-50 text-{hue}-900 dark:border-{hue}-900 dark:bg-{hue}-950/30 dark:text-{hue}-100`.
- Good/bad (not up/down): `text-emerald-600 dark:text-emerald-400` / `text-red-600 dark:text-red-400`.
- Hues: amber attention, red error or blocking, emerald success, blue information. Text on a colored fill gets its AA ratio in a comment.

**Environment identity.** Every non-production deployment carries `molecules/environment-marker`: a 2px top line and a chip naming the environment, never color alone. Production carries nothing; a bare edge means the real thing.

One canvas: a card or border must express interaction, selection, warning or a grouping spacing can't. No cards in cards. Busy: remove content. Loud: less color, weight and borders. **Hard rejects:** decorative gradients, gradient text, glows, textures, glass (`backdrop-blur` on translucent fills), colored side rails, ornamental shadows.

## Layout and responsive

- One page container per shell; constrain blocks, not the page (forms `max-w-sm`, as the sign-in view in `src/app/page.tsx`).
- Mobile-first. Grid/flex children get `min-w-0` (`atoms/input`); so does a `<fieldset>`. The page never scrolls sideways: wide content scrolls in its own `overflow-x-auto` box, with `overflow-y-clip` to avoid a phantom vertical bar.
- Toolbars `flex-wrap`; titles `truncate` on a block element. Unbounded user text never sits in a `whitespace-nowrap` control. `sticky` binds to the nearest ancestor with any `overflow`.
- Overlays cap height with `dvh`, not `vh`. Inputs are `text-base md:text-sm` so iOS doesn't zoom. Never lock zoom or orientation.

## Components

The contract is `AGENTS.md` § Components and forms. Also:

- `data-slot` on every root (a fragment gets a wrapper); `data-variant`/`data-size` where variants exist.
- **Leaf-subpath imports** (`@/app/_components/atoms/button`), never an aggregate: one heavy re-export leaks into every page's bundle.
- **Consumer or it doesn't ship:** a component, hook or helper lands with the code that uses it. Its own test makes an unrendered component look used.
- After `shadcn add`: translate default strings; apply the layout rules above.
- Key lists by stable id (`kind:id` when a list mixes entities), never index. One label map per enum, `satisfies Record<…>`.
- Icons: `lucide-react` only, default stroke; `size-4` default, `size-3.5` dense, `size-6` headers, `size-12` empty states. Decorative ones get `aria-hidden`; meaningful ones a name. No icon tiles.
- References: `atoms/button` (variants, focus ring), `atoms/input`, `molecules/form` (`FormControl` wires `aria-invalid`/`aria-describedby`), `molecules/post-card` (`PostCardSkeleton` mirrors the card), `molecules/row-actions` (icon-only trigger named after its row, tooltip), `molecules/confirm-dialog` (destructive confirm, focus returned on close), `src/lib/hooks/post/use-create-post.ts` and `use-delete-post.ts` (optimistic update, rollback).

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
- **Numeric inputs** hold `number | null` and emit `null` when cleared; callers use `?? current`, never `?? 0`; the schema rejects empty before coercing; the decimal separator follows the locale.
- **Narrow Radix values:** `onValueChange` returns any string. `safeParse` it and ignore unknowns and the `""` echo.
- Never ask users to type internal ids; don't prefill fields that decide money or dates.

**Every action answers.** Pending: `disabled` and a progressive label ("Saving…"). Every outcome is visible (toast or inline `role="alert"`), success only after it happened. Destructive actions confirm in a dialog; dangerous ones add a typed phrase. A toast is for the user; reporting is separate (`AGENTS.md` § Error reporting). Success effects go in `onSuccess`: `onSettled` runs on failure too, and `mutate()` callbacks wait for it.

**Focus after close.** When a dialog or popover closes, focus lands on the trigger or the next likely control; a controlled dialog without a trigger sets it in `onCloseAutoFocus` (or `onOpenChange` when the exit delay matters). Auto-focus never fires on a timer while `document.activeElement` is editable. Never remove a focus ring without an equivalent.

**Tooltips over `title`.** The name stays on `aria-label`; the tooltip repeats it. A disabled button sits inside a `<span>` trigger so the tooltip explaining why still shows.

## Motion

Stillness by default. Approved: `animate-spin`/`animate-pulse` for waiting, Radix open/close via tw-animate-css at 150–300 ms (200 default), `transition-colors`. Reduced motion per driver: CSS with `motion-reduce:`, JS with the library's hook. Under reduced motion, drop overlay exit animations instead of slowing them: Radix unmounts an overlay when its exit animation ends, and one that never ends leaves an invisible layer eating clicks. Never scroll-reveal, parallax, marquees, bounce or sound.

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

**Checked mechanically** by the ratchets in `scripts/ratchets.json` (`pnpm check`), each held at zero: `raw-color-literal` (Foundations), `arbitrary-text-size` (Typography), `shadow-outside-ladder` (Foundations), `one-off-number-format` (`Intl` or `toLocaleString()` outside `src/lib/utils/format.ts`) and `non-lucide-icon-import` (Components). A failure names the rule, its guardrail here and the fix.
