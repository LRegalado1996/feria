import type { UseEmblaCarouselType } from "embla-carousel-react";
import { vi } from "vitest";

type EmblaApi = NonNullable<UseEmblaCarouselType[1]>;
type Listener = (api: EmblaApi) => void;

/**
 * A stand-in for Embla's API, which measures a layout happy-dom does not
 * have. It rests on `snaps` places and moves between them as the real one
 * does (one step, never past either end, or round past them with `loop`),
 * telling its listeners; `emit()`
 * fires any other event (a drag starting, `reInit`). Mock the hook with it:
 *
 *   vi.mock("embla-carousel-react", () => ({ default: vi.fn() }));
 *   const embla = createFakeEmbla({ snaps: 3 });
 *   vi.mocked(useEmblaCarousel).mockReturnValue(embla.hook);
 *
 * `plugins` is what `api.plugins()` answers, by name (`{ autoplay }`).
 */
export function createFakeEmbla({
  loop = false,
  plugins = {},
  selected = 0,
  snaps = 3,
}: {
  /** Goes round, as Embla's `loop` does when the slides can. */
  loop?: boolean;
  plugins?: Record<string, unknown>;
  selected?: number;
  snaps?: number;
} = {}) {
  const listeners = new Map<string, Set<Listener>>();
  const root = document.createElement("div");
  const state = { selected, snaps };

  const fake = {
    canScrollNext: () =>
      loop ? state.snaps > 1 : state.selected < state.snaps - 1,
    canScrollPrev: () => (loop ? state.snaps > 1 : state.selected > 0),
    off: (event: string, listener: Listener) => {
      listeners.get(event)?.delete(listener);

      return fake;
    },
    on: (event: string, listener: Listener) => {
      const set = listeners.get(event) ?? new Set<Listener>();
      set.add(listener);
      listeners.set(event, set);

      return fake;
    },
    plugins: () => plugins,
    rootNode: () => root,
    scrollNext: vi.fn<(jump?: boolean) => void>(),
    scrollPrev: vi.fn<(jump?: boolean) => void>(),
    scrollSnapList: () =>
      Array.from({ length: state.snaps }, (_, index) => index),
    scrollTo: vi.fn<(index: number, jump?: boolean) => void>(),
    selectedScrollSnap: () => state.selected,
  };
  // The fake implements what the components call, nothing more.
  const api = fake as unknown as EmblaApi;

  const emit = (event: string) => {
    for (const listener of listeners.get(event) ?? []) {
      listener(api);
    }
  };

  const move = (index: number) => {
    state.selected = loop
      ? (index + state.snaps) % state.snaps
      : Math.min(Math.max(index, 0), state.snaps - 1);
    emit("select");
  };

  fake.scrollNext.mockImplementation(() => {
    move(state.selected + 1);
  });
  fake.scrollPrev.mockImplementation(() => {
    move(state.selected - 1);
  });
  fake.scrollTo.mockImplementation((index) => {
    move(index);
  });
  const ref = vi.fn<(node: HTMLElement | null) => void>();

  return {
    api,
    emit,
    /** The calls a test asserts on: how the carousel was asked to move. */
    fake,
    /** What `useEmblaCarousel` returns: the viewport's ref and the API. */
    hook: [ref, api] as UseEmblaCarouselType,
    /** How many listeners are still attached, for cleanup assertions. */
    listenerCount: () =>
      [...listeners.values()].reduce((count, set) => count + set.size, 0),
    ref,
    root,
    /** Re-measures with another number of places, as a resize would. */
    resize: (next: number) => {
      state.snaps = next;
      state.selected = Math.min(state.selected, next - 1);
      emit("reInit");
    },
  };
}
