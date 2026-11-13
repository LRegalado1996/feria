import { ORPCError } from "@orpc/client";
import type { ErrorEvent } from "@sentry/nextjs";
import { describe, expect, test } from "vitest";

import { REDACTED } from "@/lib/redaction";

import {
  filterClientEvent,
  isBusinessError,
  resolveSentryEnvironment,
  scrubEventSecrets,
  sentryDataCollection,
  tracesSampleRate,
} from "./sentry-options";

const CHROME_UA =
  "Mozilla/5.0 (Linux; Android 11; CUBOT_NOTE_20 Build/RP1A) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36";

function errorEvent(overrides: Partial<ErrorEvent> = {}): ErrorEvent {
  return { type: undefined, exception: { values: [] }, ...overrides };
}

function framesEvent(...files: (string | undefined)[]): ErrorEvent {
  return errorEvent({
    exception: {
      values: [
        {
          type: "Error",
          value: "boom",
          stacktrace: { frames: files.map((filename) => ({ filename })) },
        },
      ],
    },
  });
}

describe("resolveSentryEnvironment", () => {
  test.each([
    [
      "qa, after its branch",
      { VERCEL: "1", VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "qa" },
      "qa",
    ],
    [
      "production, after its target",
      { VERCEL_TARGET_ENV: "production" },
      "production",
    ],
    [
      "nothing for a throwaway branch preview, which never reports",
      { VERCEL: "1", VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "feat/x" },
      null,
    ],
    ["NODE_ENV off Vercel", { NODE_ENV: "test" }, "test"],
    ["development when NODE_ENV is blank", { NODE_ENV: "" }, "development"],
  ])("names %s", (_case, env, environment) => {
    expect(resolveSentryEnvironment(env)).toBe(environment);
  });
});

describe("tracesSampleRate", () => {
  test.each([
    ["a tenth on production", { VERCEL_ENV: "production" }, 0.1],
    ["everything on a preview", { VERCEL_ENV: "preview" }, 1],
    [
      "everything off Vercel, whatever NODE_ENV says",
      { NODE_ENV: "production" },
      1,
    ],
  ])("samples %s", (_case, env, rate) => {
    expect(tracesSampleRate(env)).toBe(rate);
  });
});

describe("sentryDataCollection", () => {
  test("sends no identity, cookies, bodies, client IPs, query values or AI data", () => {
    const clientIp = ["forwarded", "-ip", "remote-", "via", "-user"];

    expect(sentryDataCollection()).toEqual({
      userInfo: false,
      cookies: false,
      httpHeaders: { deny: clientIp },
      httpBodies: [],
      urlQueryParams: { deny: clientIp },
      databaseQueryData: false,
      graphQL: { document: false, variables: false },
      genAI: { inputs: false, outputs: false },
      stackFrameVariables: true,
      frameContextLines: 7,
    });
  });

  test("returns a fresh object on every call", () => {
    expect(sentryDataCollection()).not.toBe(sentryDataCollection());
  });
});

describe("scrubEventSecrets", () => {
  test("withholds a failed query's values wherever they appear", () => {
    const event = errorEvent({
      message: "Failed query: select 1\nparams: secret-token",
      breadcrumbs: [
        { message: "Failed query: x\nparams: tok", data: { token: "abc" } },
      ],
      extra: { params: ["tok"] },
      request: { headers: { authorization: "Bearer abc", accept: "*/*" } },
    });

    const scrubbed = scrubEventSecrets(event);

    expect(scrubbed.message).toBe(
      `Failed query: select 1\nparams: ${REDACTED}`
    );
    expect(scrubbed.breadcrumbs?.[0]).toEqual({
      message: `Failed query: x\nparams: ${REDACTED}`,
      data: { token: REDACTED },
    });
    expect(scrubbed.extra).toEqual({ params: REDACTED });
    expect(scrubbed.request?.headers).toEqual({
      authorization: REDACTED,
      accept: "*/*",
    });
  });

  test("leaves the original event untouched", () => {
    const event = errorEvent({ message: "params: x" });

    scrubEventSecrets(event);

    expect(event.message).toBe("params: x");
  });
});

describe("isBusinessError", () => {
  test.each([
    ["BAD_REQUEST", true],
    ["UNAUTHORIZED", true],
    ["FORBIDDEN", true],
    ["NOT_FOUND", true],
    ["CONFLICT", true],
    ["TOO_MANY_REQUESTS", false],
    ["INTERNAL_SERVER_ERROR", false],
  ])("is %s a typed refusal: %s", (code, business) => {
    expect(isBusinessError(new ORPCError(code))).toBe(business);
  });

  test("ignores a plain error whose message names a code", () => {
    expect(isBusinessError(new Error("NOT_FOUND"))).toBe(false);
  });
});

describe("filterClientEvent", () => {
  test("keeps a real user's error, scrubbed", () => {
    const kept = filterClientEvent(
      errorEvent({ message: "params: tok" }),
      { originalException: new Error("boom") },
      CHROME_UA
    );

    expect(kept).toEqual(errorEvent({ message: `params: ${REDACTED}` }));
  });

  test.each([
    ["a token ending in bot", "Mozilla/5.0 (compatible; Googlebot/2.1)"],
    ["a named crawler", "Mozilla/5.0 HeadlessChrome/120"],
  ])("drops crawler traffic: %s", (_case, userAgent) => {
    expect(filterClientEvent(errorEvent(), {}, userAgent)).toBeNull();
  });

  test("keeps a phone whose model merely contains a crawler word", () => {
    // CUBOT_NOTE_20: "bot" continues into the token, so it is not a crawler.
    expect(filterClientEvent(errorEvent(), {}, CHROME_UA)).toEqual(
      errorEvent()
    );
  });

  test("drops an event Sentry's parser already classified as a spider", () => {
    const event = errorEvent({ contexts: { device: { family: "Spider" } } });

    expect(filterClientEvent(event, {}, undefined)).toBeNull();
  });

  test.each(["401", "403", "404"])(
    "drops a streamed %s navigation signal",
    (status) => {
      const signal = Object.assign(new Error("x"), {
        digest: `NEXT_HTTP_ERROR_FALLBACK;${status}`,
      });

      expect(
        filterClientEvent(
          errorEvent(),
          { originalException: signal },
          CHROME_UA
        )
      ).toBeNull();
    }
  );

  test.each(["NEXT_HTTP_ERROR_FALLBACK;500", "1234567890"])(
    "keeps an error with the digest %j, which Next does not treat as navigation",
    (digest) => {
      const error = Object.assign(new Error("x"), { digest });

      expect(
        filterClientEvent(errorEvent(), { originalException: error }, CHROME_UA)
      ).toEqual(errorEvent());
    }
  );

  test("drops a typed business error", () => {
    expect(
      filterClientEvent(
        errorEvent(),
        { originalException: new ORPCError("UNAUTHORIZED") },
        CHROME_UA
      )
    ).toBeNull();
  });

  test("drops an error raised entirely inside a browser extension", () => {
    const event = framesEvent(
      "chrome-extension://abc/content.js",
      undefined,
      "moz-extension://def/inject.js"
    );

    expect(filterClientEvent(event, {}, CHROME_UA)).toBeNull();
  });

  test("keeps an error that passes through the app's own code", () => {
    const event = framesEvent(
      "chrome-extension://abc/content.js",
      "https://app.example.com/_next/static/chunks/app.js"
    );

    expect(filterClientEvent(event, {}, CHROME_UA)).toEqual(event);
  });

  test("keeps an error whose frames name no file", () => {
    const event = framesEvent(undefined);

    expect(filterClientEvent(event, {}, CHROME_UA)).toEqual(event);
  });
});
