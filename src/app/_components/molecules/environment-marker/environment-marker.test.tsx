import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import type { Locale } from "@/lib/i18n/config";

import { EnvironmentMarker } from "./environment-marker";

// `server-only` throws on import outside a React Server Components build.
vi.mock("server-only", () => ({}));

// Every variable the marker reads, cleared, so the machine running the test
// cannot leak its own Vercel environment in.
const UNSET = {
  NODE_ENV: "production",
  VERCEL_ENV: "",
  VERCEL_GIT_COMMIT_REF: "",
  VERCEL_TARGET_ENV: "",
};

function setup(env: Partial<typeof UNSET> = {}, locale: Locale = "en") {
  for (const [name, value] of Object.entries({ ...UNSET, ...env })) {
    vi.stubEnv(name, value);
  }

  return render(<EnvironmentMarker locale={locale} />);
}

describe("EnvironmentMarker", () => {
  test.each([
    [
      "the qa branch",
      { VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "qa" },
      "qa",
      "QA",
    ],
    ["a custom qa environment", { VERCEL_TARGET_ENV: "qa" }, "qa", "QA"],
    [
      "a branch preview",
      { VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "feat/x" },
      "preview",
      "Preview",
    ],
    ["next dev", { NODE_ENV: "development" }, "development", "Development"],
  ] as const)(
    "names %s in words, not only by color",
    (_label, env, environment, name) => {
      setup(env);

      const marker = screen.getByTestId("environment-marker");
      expect(marker).toHaveAttribute("data-environment", environment);
      expect(screen.getByText(name)).toBeInTheDocument();
      expect(marker).toHaveTextContent(`Environment: ${name}`);
    }
  );

  test.each([
    [{ VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "qa" }, "Entorno: QA"],
    [{ VERCEL_ENV: "preview" }, "Entorno: Vista previa"],
    [{ NODE_ENV: "development" }, "Entorno: Desarrollo"],
  ] as const)("names %j in Spanish on a Spanish page", (env, text) => {
    setup(env, "es");

    expect(screen.getByTestId("environment-marker")).toHaveTextContent(text);
  });

  test.each([
    ["a production deploy", { VERCEL_ENV: "production" }],
    [
      "the production branch",
      { VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "main" },
    ],
    ["a build with no Vercel variables", {}],
  ] as const)("renders nothing on %s", (_label, env) => {
    const { container } = setup(env);

    expect(container).toBeEmptyDOMElement();
  });

  test("keeps the line out of the accessibility tree and the click path", () => {
    setup({ VERCEL_ENV: "preview" });

    const line = screen.getByTestId("environment-marker").firstElementChild;
    expect(line).toHaveAttribute("aria-hidden", "true");
    expect(line).toHaveClass("pointer-events-none", "h-0.5", "top-0");
  });
});
