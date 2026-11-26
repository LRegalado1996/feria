import { render } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { StoreVisitCount } from "./store-visit-count";

// When and how the visit is counted is `use-count-visit.test.tsx`'s.
const { useCountVisit } = vi.hoisted(() => ({ useCountVisit: vi.fn() }));

vi.mock("@/lib/hooks/metrics", () => ({ useCountVisit }));

describe("StoreVisitCount", () => {
  test("counts the session's visit and draws nothing", () => {
    const { container } = render(<StoreVisitCount />);

    expect(useCountVisit).toHaveBeenCalledExactlyOnceWith();
    expect(container).toBeEmptyDOMElement();
  });
});
