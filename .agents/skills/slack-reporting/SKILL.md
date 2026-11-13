---
name: slack-reporting
description: Report project progress to Lucas's Slack workspace, tidily and in the right channel. Use when a ticket starts or finishes, a PR is opened, reviewed or merged, QA or production is deployed, a decision is made or needed, or a work session ends.
---

# Slack reporting

Lucas follows the project from Slack (workspace `lucasregalado`). Every event
below gets one message in its channel. The repo stays the source of truth:
Slack says what happened and links to where it lives.

## Channels

| Channel | What goes there |
| --- | --- |
| `#feria-general` | Decisions made, questions that need Lucas, and one summary at the end of each work session. |
| `#feria-tickets` | A ticket starts, finishes, is blocked, or is created. |
| `#feria-prs` | A PR is opened, each review round's outcome, ready to merge, merged. |
| `#feria-deploys` | QA or production updated, a failed deployment, a production error. |

Links: [general](https://app.slack.com/client/T0CHJT9S0RG/C0CH3QVTMRV) ·
[tickets](https://app.slack.com/client/T0CHJT9S0RG/C0CH3R21XGF) ·
[prs](https://app.slack.com/client/T0CHJT9S0RG/C0CHDTN2JF7) ·
[deploys](https://app.slack.com/client/T0CHJT9S0RG/C0CHM3S8QL9)

## Rules

- **Spanish.** Slack is for Lucas, not the repo. Ticket ids, PR titles and
  branch names stay as they are.
- **One event, one message.** Follow-ups to the same ticket or PR go in that
  message's thread, so each channel reads as a list of events.
- **Lead with the fact**, then the link. No greetings, no emojis, no filler.
  Two or three lines at most; the detail is behind the link.
- **Always a link**: the ticket file, the PR, the deployment URL.
- **Say what is needed from Lucas** in the first line when something is
  ("Necesito tu decisión: ..."), and post it in `#feria-general` as well.
- **Never post** secrets, tokens, environment values, customer names or phone
  numbers.
- **Report failures the same way as successes.** A red check or a failed
  deployment is posted when it happens, not when it is fixed.

## Formats

```
#feria-tickets
FER-017 en curso: Article upload wizard
Rama fer-017-article-wizard · docs/tickets/FER-017-article-wizard.md

FER-017 terminado: Article upload wizard
PR #23 mergeado a qa · queda pendiente: nada
```

```
#feria-prs
PR #23 abierto: feat(admin): add the article upload wizard
https://github.com/LRegalado1996/feria/pull/23 · FER-017 · con capturas

(in the thread)
Ronda 1 con CodeRabbit: 3 arreglados, 1 rechazado (pedía una columna JSON), 0 abiertos.
Listo para mergear: checks en verde. Necesito tu visto bueno.
```

```
#feria-deploys
QA actualizado con PR #23
https://feria-git-qa-....vercel.app · chequeo de salud OK
```

```
#feria-general
Resumen de la sesión (13 nov)
Hecho: FER-001, FER-004. En curso: FER-005. Bloqueado: nada.
Necesito de vos: instalar CodeRabbit en el repo.
```

## How to post

1. Use a Slack connector's tools when the session has one.
2. Otherwise use the browser (Claude in Chrome) on the channel links above.
   Messages then appear under Lucas's own name; start those with `[Claude]`.
3. If neither works, do not skip silently: list the messages that could not be
   posted in the final reply of the session.

Posting to these four channels is already authorized by Lucas. Anything else in
Slack (other channels, direct messages, installing apps, inviting people) needs
his go-ahead first.
