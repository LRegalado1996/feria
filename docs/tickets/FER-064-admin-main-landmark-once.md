# FER-064 The admin has one main landmark after navigating

- **Milestone:** M3 Admin
- **Priority:** P1
- **Status:** todo
- **Depends on:** FER-013, FER-040

Refs: FER-013, FER-040

## Goal

However the person got to an admin screen, the page holds one `<main id="admin-main">`: the skip link lands on the screen being shown, and assistive technology finds one main landmark.

## The problem

Found on 2026-11-20 while checking the home stack (FER-020 to FER-060); it dates from the admin shell (FER-013, `a1591e2`), not from that stack.

Each admin page checks the session itself and renders `organisms/admin-shell`, because a layout does not re-render on navigation and must never be what keeps a page private (`src/app/[locale]/admin/layout.tsx`, `AGENTS.md` § Architecture). The shell draws `<main className="min-w-0" id="admin-main" tabIndex={-1}>` and the skip link `href="#admin-main"`. After client-side navigation, Next keeps the routes left behind mounted and hidden, so the document ends up with several shells, several `<main>` and several elements with the id `admin-main`. The ids are duplicated (invalid HTML), the skip link jumps to the first one in the document, which can be a hidden screen's, and a screen reader's landmark list can offer more than one main.

## Scope

Pick one of the two, measured against what the shell needs:

1. **The `<main>` in the admin layout.** The layout renders only chrome, the landmark and the skip link (no session, no data: allowed by the rule above), and each page renders its shell's contents inside it. One `<main id="admin-main">` for the whole admin, whatever is kept mounted. Needs the shell split into the layout's frame and each page's part, and a check that a hidden kept route's content is not inside a visible landmark twice.
2. **No fixed id.** Each shell's `main` gets an id of its own (`useId()`), and its skip link points at it; hidden routes keep their own landmark, but the browser hides them (`hidden`/`display: none`), so assistive technology and the skip link only meet the visible one. Smaller change; relies on Next hiding kept routes from the accessibility tree.

## Acceptance criteria

- After navigating between three admin screens and back, `document.querySelectorAll("#admin-main")` (or the chosen id) matches one element, and the accessibility tree has one main landmark.
- The skip link moves focus into the screen being shown, on the first load and after navigation.
- E2E covers both, at phone and computer width.

## Reporting

Report this ticket in Slack as the `slack-reporting` skill describes. The skill is the only place that says which event goes to which channel and who posts it.
