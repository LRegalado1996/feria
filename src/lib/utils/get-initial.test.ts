import { expect, test } from "vitest";

import { getInitial } from "./get-initial";

test.each([
  ["alice", "A"],
  ["Bob", "B"],
  ["z", "Z"],
  ["", ""],
])("reads the initial of %j as %j", (name, initial) => {
  expect(getInitial(name)).toBe(initial);
});
