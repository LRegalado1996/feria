# FER-034 Coming-soon page, managed from the admin

- **Milestone:** M0 Foundation
- **Priority:** P0
- **Status:** in progress
- **Depends on:** FER-002, FER-005, FER-013, FER-014

## Goal

While the store is not open, anyone who opens the site sees a good-looking "opening soon" page instead of an unfinished store, and the store's admins decide from the admin, not from a deployment setting, when the public sees the store, and what the page says.

## Scope

Rewritten on 2026-11-18 at Lucas's request: "This page must be configurable from the admin: edit its content and a button to publish it or not. If it is published, nothing of the site is visible, everything redirects to that page; if not, the whole site is visible." It replaces the environment switch (`STOREFRONT_LAUNCHED`) the first version shipped with, which is gone.

- **A publish switch in the admin**, `/admin/settings/coming-soon` ("Próximamente"), reached from a card on the settings screen and from the strip over the closed store. It lives under the settings rather than as a section of its own: a ninth section pushed sign-out below a 720 px phone screen in the menu. Published, every public storefront address answers a temporary redirect (307) to `/coming-soon` in the address's language, the page is `noindex` and the sitemap is empty; the cart takes no orders but from a signed-in admin. Not published, the whole store is visible and `/coming-soon` leads home. `/admin`, the API and the health check work either way.
- **The default is published.** The switch lives in the database (`coming_soon`, `docs/project/data-model.md`), and no row reads as published: production, closed until now, stays closed when this ships, without anyone touching anything. `pnpm db:seed` makes the row unpublished, so local work and a seeded database show the store. A database that has never been seeded (qa, a fresh e2e database) is closed until an admin opens it.
- **Editable content, in Spanish and English:** the eyebrow over the headline (the fair and its dates, one line, 80 characters; editable too, decided 2026-11-19, so it never contradicts a changed countdown), the headline (up to two lines, the second in the accent), the text under it, the marquee band's phrases (up to four, after the store's name) and the day the countdown counts to (midnight in Montevideo; empty, the fair's opening, December 5). An empty text says the dictionary's copy, language by language, never the other language's. The countdown's label ("días para la feria"), the layout and the logo with its bubbles stay as they were.
- **The social links follow the store's settings** (decided 2026-11-19): Instagram and TikTok are the store's own (FER-014, as the footer's), each the brand's fixed profile (`SOCIAL_LINKS`) when the store has none set or cannot be read, so the page still says where to follow it during an outage.
- **The admin's screen:** the switch first, its state in words and in a chip ("Publicada" or "Sin publicar"), publishing only after a confirmation since it hides the whole store, opening at once; a link that opens the page itself in a new tab; then the texts in both languages, each empty field showing the text the page will say, and the countdown's day, saved from the top bar's button (under the thumb on a phone).
- **A signed-in admin sees the store while it is published**, with a strip over every store page ("La tienda está cerrada al público. La ves porque iniciaste sesión.") that links to the screen. An admin may also preview `/coming-soon` while it is not published. Without an admin session everything leads to the coming-soon page.
- **How the proxy decides** (`src/proxy.ts`, `docs/agents/nextjs.md` § Proxy): it reads the switch from the database through a read it remembers for 5 seconds per server (Next runs no `"use cache"` in the proxy, and the proxy shares no memory with the functions that save, so a flip reaches every server within that window). It fails closed: a read that fails or takes over 5 seconds is reported and counts as published, and the coming-soon page itself falls back to the dictionary's texts when it cannot read its own. The admin's bypass rests on a session the proxy validates itself (the session's token looked up in the database past Better Auth's cookie cache, the login re-read as `adminProcedure` does), asked only of a request that carries a session cookie, so the public costs nothing. No page's server output depends on who asked: the strip is drawn in the browser from a cookie the proxy sets on the admin's pages (it grants nothing), so no cache can serve an admin's view to the public, and the proxy runs before every cache, so a closed store's cached pages never reach the public.
- Both languages with the toggle; reduced motion respected; a proper title and share card, so a link pasted into WhatsApp already looks like the brand.
- Launch is taking the page down from the admin; no deploy and no code change.

## Acceptance criteria

- Published, `/`, a catalog page and any article URL, in both languages, answer a temporary redirect to the coming-soon page, which no cache keeps; `/admin` still signs in.
- A signed-in admin sees the store, with the strip that says it is closed and leads to the screen.
- Taken down from the admin, the public sees the store and `/coming-soon` leads home; published again (after the confirmation), the public is redirected again.
- Texts and a day edited in the admin show on the page in both languages; an empty text falls back to the dictionary's.
- Lighthouse on mobile: performance and accessibility at 95 or above.
- E2E covers both positions of the switch, driven through the admin's API and screen.

## Notes

The page uses the FER-006 logo. Lucas asked for it to be fun: the headline rises in, the days to the fair count up, and the logo blows a burst of bubbles on load and on every press.

The e2e suite drives the real switch: the `closed` project's worker publishes the page through the admin's API before its specs (`*.closed.e2e.ts`) and takes it down after them, every other project's worker makes sure it is down, and a test that edits the page or flips it asks for `comingSoonEdit`, which writes the closed, empty page back (`src/e2e/AGENTS.md`). There is no test-only override left in the app.

Still open, and the ticket is not done until it holds:

- **Lighthouse.** The two scores have not been measured (the tool is not a dependency of the repo). Someone else measures the deployed coming-soon page on mobile later and fixes what falls under 95.

Settled: "`/admin` still signs in" with the page published is checked by `src/e2e/tests/coming-soon/coming-soon.closed.e2e.ts` (the sign-in form, then the store with its strip).

## Reporting

Report this ticket in Slack as the `slack-reporting` skill describes. The skill is the only place that says which event goes to which channel and who posts it.
