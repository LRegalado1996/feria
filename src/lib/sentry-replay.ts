import { reportError } from "@/lib/errors/client";
import { whenPageIdle } from "@/lib/utils/page-idle";

/**
 * How long after the page is idle the recorder joins: past a phone's first
 * seconds on the page, when its scripts compete with the page's own.
 */
export const REPLAY_DELAY_MS = 5000;

/** What the loader needs of the SDK: `@sentry/nextjs` itself, or a test's double. */
interface ReplaySdk<Integration> {
  addIntegration: (integration: Integration) => void;
  replayIntegration: () => Integration;
}

/**
 * Adds Sentry's session replay a few seconds after the page is idle
 * (FER-024). The recorder is the heaviest script a store page loaded (about
 * 150 KB compressed, more than React), and started with the SDK it competed
 * with every page's first photo on a phone. Imported here it is its own
 * chunk, fetched once the page has settled. Replays still record only
 * around an error (`replaysOnErrorSampleRate`); an error in the page's first
 * seconds has no replay, and its event is sent all the same. A chunk that
 * fails to load (offline, a release replaced meanwhile) is reported, and the
 * page carries on without replays.
 */
export function addReplayAfterLoad<Integration>(
  load: () => Promise<ReplaySdk<Integration>>,
  win: Window = window
): void {
  const add = async () => {
    try {
      const { addIntegration, replayIntegration } = await load();
      addIntegration(replayIntegration());
    } catch (error) {
      reportError(error, { action: "Sentry.load_replay" });
    }
  };

  whenPageIdle(
    () => {
      win.setTimeout(() => {
        void add();
      }, REPLAY_DELAY_MS);
    },
    { win }
  );
}
