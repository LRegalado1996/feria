import { describe, expect, test } from "vitest";

import { isKnownBot } from "./known-bot";

const CHROME =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1";

describe("isKnownBot", () => {
  test.each([
    [
      "Googlebot",
      "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
    ],
    [
      "Bingbot",
      "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)",
    ],
    [
      "an AI crawler",
      "Mozilla/5.0 (compatible; GPTBot/1.2; +https://openai.com/gptbot)",
    ],
    ["a crawler named so", "Mozilla/5.0 (compatible; SomeCrawler/1.0)"],
    ["a spider", "Mozilla/5.0 (compatible; Baiduspider/2.0)"],
    ["a headless Chrome", CHROME.replace("Chrome/", "HeadlessChrome/")],
    ["Lighthouse", `${CHROME} Chrome-Lighthouse`],
    ["a link preview", "WhatsApp/2.23.20.0 A"],
    ["Facebook's preview", "facebookexternalhit/1.1"],
    ["curl", "curl/8.7.1"],
    ["a Python script", "python-requests/2.32.3"],
    ["Go's client", "Go-http-client/2.0"],
    ["no user agent", null],
    ["an empty one", "  "],
  ])("is true for %s", (_case, userAgent) => {
    expect(isKnownBot(userAgent)).toBe(true);
  });

  test.each([
    ["Chrome on a computer", CHROME],
    ["Safari on an iPhone", IPHONE],
    [
      "a Cubot phone, whose brand ends in 'bot'",
      "Mozilla/5.0 (Linux; Android 12; CUBOT P80) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
    ],
    [
      "Firefox",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 14.7; rv:132.0) Gecko/20100101 Firefox/132.0",
    ],
  ])("is false for %s", (_case, userAgent) => {
    expect(isKnownBot(userAgent)).toBe(false);
  });
});
