import { QueryClient } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { describe, expect, test, vi } from "vitest";

import { server } from "@/test/msw";

const { addBreadcrumb } = vi.hoisted(() => ({ addBreadcrumb: vi.fn() }));

vi.mock("@sentry/nextjs", () => ({ addBreadcrumb }));

// The link passes the output through untouched, so any non-empty page proves
// it came from the server rather than from a default.
const FEED_PAGE = { items: [{ id: 1, name: "Hello" }], nextCursor: null };

const ok = () => HttpResponse.json({ json: FEED_PAGE, meta: [] });

// Vercel's own answer to a pin it will not route.
const refusedPin = () =>
  new HttpResponse("The deployment could not be found on Vercel.", {
    status: 404,
    headers: { "x-vercel-error": "DEPLOYMENT_NOT_FOUND" },
  });

/**
 * A fresh copy of the module (the released pin is module state), built for a
 * deployment id, against a `post.getAll` that answers `answers` in order and
 * records every request it receives.
 */
async function setup({
  answers = [ok],
  deploymentId,
}: {
  answers?: (() => Response)[];
  deploymentId?: string;
} = {}) {
  vi.resetModules();

  if (deploymentId) {
    vi.stubEnv("NEXT_DEPLOYMENT_ID", deploymentId);
  }

  const requests: Request[] = [];
  const queue = [...answers];
  server.use(
    http.post("http://localhost:3000/api/orpc/post/getAll", ({ request }) => {
      requests.push(request);
      return (queue.shift() ?? ok)();
    })
  );

  const clientModule = await import("./client");
  const pins = () =>
    requests.map((request) => request.headers.get("x-deployment-id"));

  return { ...clientModule, pins, requests };
}

describe("oRPC client link", () => {
  test("calls the app's own origin with the session cookie", async () => {
    const { client, requests } = await setup();

    await expect(client.post.getAll({})).resolves.toEqual(FEED_PAGE);

    expect(
      requests.map(({ credentials, method, url }) => ({
        credentials,
        method,
        url,
      }))
    ).toEqual([
      {
        credentials: "include",
        method: "POST",
        url: "http://localhost:3000/api/orpc/post/getAll",
      },
    ]);
  });

  test("sends no pin when the build has no deployment id", async () => {
    const { client, pins } = await setup();

    await client.post.getAll({});

    expect(pins()).toEqual([null]);
  });

  test("pins every call to the deployment that served the page", async () => {
    const { client, pins } = await setup({ deploymentId: "dpl_tab" });

    await client.post.getAll({});
    await client.post.getAll({});

    expect(pins()).toEqual(["dpl_tab", "dpl_tab"]);
  });

  test("re-sends a refused call once, unpinned, and drops the pin for the tab", async () => {
    const { client, pins } = await setup({
      answers: [refusedPin, ok, ok],
      deploymentId: "dpl_tab",
    });

    await expect(client.post.getAll({})).resolves.toEqual(FEED_PAGE);
    await client.post.getAll({});

    expect(pins()).toEqual(["dpl_tab", null, null]);
    expect(addBreadcrumb).toHaveBeenCalledExactlyOnceWith({
      category: "skew-protection",
      level: "warning",
      message: "Vercel refused the deployment pin; this tab now calls unpinned",
    });
  });

  test("keeps the pin on the app's own 404, which is an answer, not a refusal", async () => {
    const { client, pins } = await setup({
      answers: [
        () =>
          HttpResponse.json(
            {
              json: {
                defined: false,
                code: "NOT_FOUND",
                status: 404,
                message: "Not found",
              },
              meta: [],
            },
            { status: 404 }
          ),
      ],
      deploymentId: "dpl_tab",
    });

    await expect(client.post.getAll({})).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Not found",
    });
    await client.post.getAll({});

    expect(pins()).toEqual(["dpl_tab", "dpl_tab"]);
  });

  test("passes on any other failure without a retry", async () => {
    const { client, pins } = await setup({
      answers: [() => HttpResponse.error()],
      deploymentId: "dpl_tab",
    });

    await expect(client.post.getAll({})).rejects.toThrow("Failed to fetch");

    // One request, still pinned: a network failure is not Vercel's refusal.
    expect(pins()).toEqual(["dpl_tab"]);
  });
});

describe("getQueryClient", () => {
  test("keeps one QueryClient for the browser tab", async () => {
    const { getQueryClient } = await setup();

    const first = getQueryClient();

    expect(first).toBeInstanceOf(QueryClient);
    expect(getQueryClient()).toBe(first);
  });

  test("builds a new QueryClient per server render", async () => {
    const { getQueryClient } = await setup();
    vi.stubGlobal("window", undefined);

    const first = getQueryClient();

    expect(first).toBeInstanceOf(QueryClient);
    expect(getQueryClient()).not.toBe(first);
  });
});

describe("ORPCReactProvider", () => {
  test("renders its children inside the query client", async () => {
    const { ORPCReactProvider } = await setup();

    render(
      <ORPCReactProvider>
        <div data-testid="child">Hello</div>
      </ORPCReactProvider>
    );

    expect(screen.getByTestId("child")).toHaveTextContent("Hello");
  });
});
