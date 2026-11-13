import type { TestingLibraryMatchers } from "@testing-library/jest-dom/matchers";

// Vitest 5 added a second generic to `Assertion`; interface merging requires the
// augmentation to declare the same type parameters, or the matchers vanish from it.
// The interfaces are empty on purpose: they exist only to merge the matchers in,
// and the fixers would turn them into type aliases, which do not merge.
// oxlint-disable typescript/no-empty-object-type, typescript/no-empty-interface
declare module "vitest" {
  interface Assertion<
    R extends void | Promise<void> = void,
    T = unknown,
  > extends TestingLibraryMatchers<typeof expect.stringContaining, T> {}
  interface AsymmetricMatchersContaining extends TestingLibraryMatchers<
    unknown,
    unknown
  > {}
}
// oxlint-enable typescript/no-empty-object-type, typescript/no-empty-interface
