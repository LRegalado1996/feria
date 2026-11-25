# FER-082 Tell Bing at once when the catalog changes (IndexNow)

- **Milestone:** M6 Launch
- **Priority:** P2
- **Status:** todo
- **Depends on:** FER-032

## Goal

A new or changed article or category shows up in Bing (and so in ChatGPT search and Copilot) within hours, not when Bing next crawls the sitemap.

## The problem

Found on 2026-11-25 while doing FER-032. A catalog changes often: articles are published, edited and taken down every day before the fair. Bing rereads `sitemap.xml` on its own schedule. [IndexNow](https://www.indexnow.org/) lets a site tell Bing (and Yandex, Seznam, Naver) right away which URLs changed. Google ignores it.

## Scope

- The key exists since FER-032: `public/239a2df8583d65e79cf2271b09b4c09c.txt`, outside the proxy. It is not a secret (Bing reads it from the site). QA serves the same file, so the code sends nothing outside production.
- After a write that changes what the storefront shows (`writeToCatalog`, the category writes, a page's publication), POST the changed URLs in both languages to `https://api.indexnow.org/indexnow` with `host`, `key`, `keyLocation` and `urlList`. Production only. A failure is reported (`reportError`) and never fails the write.
- Taken-down articles are sent too: IndexNow is how Bing learns a URL now answers 404.
- Unit tests on the URLs sent per write; no e2e reaches the real endpoint.

## Acceptance criteria

- Publishing an article in production makes one POST naming its two URLs, answered 200 or 202.
- QA and previews send nothing.

## Reporting

Report this ticket in Slack as the `slack-reporting` skill describes. The skill is the only place that says which event goes to which channel and who posts it.
