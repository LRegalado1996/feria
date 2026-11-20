# FER-071 The store settings form follows a newer read

- **Milestone:** M3 Admin
- **Priority:** P2
- **Status:** todo
- **Depends on:** FER-014

## Goal

When the store's settings change elsewhere (another tab, another admin) while the settings screen is open, the fields the admin has not touched show the newer values; the ones being edited are kept.

## The problem

Found on 2026-11-20 while reviewing FER-034 (#69), whose coming-soon form got this fix (react-hook-form's `values` with `resetOptions: { keepDirtyValues: true }`, and a save's reset that clears what was saved). `organisms/settings-form` (FER-014, already in `qa`) still takes its values once, at mount, so a newer read is ignored and a save writes back what the admin never saw change.

## Scope

- The same pattern as `molecules/coming-soon-form`: follow a newer read for untouched fields, keep the edited ones, and after a save stop treating the saved ones as edited.

## Acceptance criteria

- Unit tests: a newer read replaces an untouched field and leaves an edited one; after a save, a newer read replaces the field that was saved.

## Reporting

Report this ticket in Slack as the `slack-reporting` skill describes. The skill is the only place that says which event goes to which channel and who posts it.
