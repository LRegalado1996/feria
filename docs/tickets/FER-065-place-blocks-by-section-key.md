# FER-065 A block's place between rows follows the row, not a number

- **Milestone:** M3 Admin
- **Priority:** P2
- **Status:** todo
- **Depends on:** FER-020, FER-058, FER-059

## Goal

When the owner chooses where a banner or an article spotlight goes ("after Anillos"), it lands there even if the page's order changed between opening the sheet and saving it.

## The problem

Raised by CodeRabbit on #68 (FER-020) and #75 (FER-059). The banner's and the spotlight's sheets keep their place between rows as a position number. If the page is refreshed while the sheet is open (another sheet's save, another admin), a row or block inserted before that position shifts it: the block lands one place off, without the owner changing anything.

## Scope

- Both sheets keep the key of the block they follow (`pageSectionKey`), not an index, and the service resolves it against the order it holds under the pages' lock.
- If that block is gone when saving, the sheet asks the owner to choose the place again instead of guessing.

## Acceptance criteria

- A banner or spotlight placed "after X" while another block is inserted before X lands right after X.
- With X deleted meanwhile, the save is refused with a message and the sheet stays open.
- Unit and integration tests on both sides.

## Reporting

Report this ticket in Slack as the `slack-reporting` skill describes. The skill is the only place that says which event goes to which channel and who posts it.
