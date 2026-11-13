import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { EnvironmentMarker } from "./environment-marker";

// Every variable the marker reads, cleared, so the machine running the test
// cannot leak its own Vercel environment in.
const UNSET = {
  NODE_ENV: "production",
  VERCEL_ENV: "",
  VERCEL_GIT_COMMIT_REF: "",
  VERCEL_TARGET_ENV: "",
};

function setup(env: Partial<typeof UNSET> = {}) {
  for (const [name, value] of Object.entries({ ...UNSET, ...env })) {
    vi.stubEnv(name, value);
  }

  return render(<EnvironmentMarker />);
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
