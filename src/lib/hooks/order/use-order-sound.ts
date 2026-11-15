import { useMemo, useRef, useSyncExternalStore } from "react";

import { reportError } from "@/lib/errors/client";

/** Where the browser remembers whether new orders make a sound. */
export const ORDER_SOUND_STORAGE_KEY = "feria:admin:order-sound";

const ON = "on";
const OFF = "off";

/** The beep: short, one mid-high tone, well under a second. */
const BEEP_HZ = 880;
const BEEP_SECONDS = 0.18;
const BEEP_GAIN = 0.2;
const SILENT_GAIN = 0.0001;

/**
 * The remembered choice, as an external store for `useSyncExternalStore`:
 * this tab's toggles reach its subscribers, the `storage` event carries
 * other tabs' toggles. Once storage refused a read or a write (a browser
 * that blocks site data), the choice lives in the page instead, reported
 * once.
 */
function createPreference() {
  const listeners = new Set<() => void>();
  let inPage: boolean | null = null;

  return {
    read: (): boolean => {
      if (inPage !== null) {
        return inPage;
      }

      try {
        return window.localStorage.getItem(ORDER_SOUND_STORAGE_KEY) === ON;
      } catch (error) {
        reportError(error, { action: "Orders.read_sound_preference" });
        inPage = false;
        return inPage;
      }
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      window.addEventListener("storage", listener);

      return () => {
        listeners.delete(listener);
        window.removeEventListener("storage", listener);
      };
    },
    write: (enabled: boolean) => {
      if (inPage === null) {
        try {
          window.localStorage.setItem(
            ORDER_SOUND_STORAGE_KEY,
            enabled ? ON : OFF
          );
        } catch (error) {
          reportError(error, { action: "Orders.save_sound_preference" });
          inPage = enabled;
        }
      } else {
        inPage = enabled;
      }

      for (const listener of listeners) {
        listener();
      }
    },
  };
}

// Unknown on the server and while hydrating: the browser's choice must not
// change the first render.
function serverSnapshot(): boolean | null {
  return null;
}

/**
 * Whether a new order beeps (FER-027): off unless the staff turned it on,
 * remembered by this browser. `enabled` is `null` until the browser's choice
 * is read. A browser without Web Audio stays silent; nothing fails.
 */
export function useOrderSound() {
  // One store per screen, kept for its identity: React subscribes again
  // whenever `subscribe` changes.
  const preference = useMemo(() => createPreference(), []);
  const enabled = useSyncExternalStore(
    preference.subscribe,
    preference.read,
    serverSnapshot
  );
  // One context for the page: browsers cap how many a page may open.
  const context = useRef<AudioContext | null>(null);

  /** The page's audio context, woken up; `null` without Web Audio. */
  const audio = (): AudioContext | null => {
    // Typed as always there; an old or locked-down browser has none.
    const AudioContextClass: typeof AudioContext | undefined =
      window.AudioContext;

    if (!AudioContextClass) {
      return null;
    }

    const output = context.current ?? new AudioContextClass();
    context.current = output;

    // A context made without a tap starts suspended (autoplay rules); the
    // toggle's tap wakes it, and a refusal only means no sound.
    if (output.state === "suspended") {
      void (async () => {
        try {
          await output.resume();
        } catch (error) {
          reportError(error, { action: "Orders.resume_sound" });
        }
      })();
    }

    return output;
  };

  const beep = () => {
    try {
      const output = audio();

      if (!output) {
        return;
      }

      const oscillator = output.createOscillator();
      const gain = output.createGain();
      const start = output.currentTime;
      oscillator.frequency.value = BEEP_HZ;
      gain.gain.setValueAtTime(BEEP_GAIN, start);
      gain.gain.exponentialRampToValueAtTime(SILENT_GAIN, start + BEEP_SECONDS);
      oscillator.connect(gain).connect(output.destination);
      oscillator.start(start);
      oscillator.stop(start + BEEP_SECONDS);
    } catch (error) {
      // A sound is a convenience: the list and its announcement still say
      // the order arrived.
      reportError(error, { action: "Orders.play_sound" });
    }
  };

  return {
    enabled,
    /** Beeps if the staff turned the sound on. */
    play: () => {
      if (enabled === true) {
        beep();
      }
    },
    /**
     * Turns the sound on or off. Turning it on beeps once, inside the tap:
     * the staff hears what a new order sounds like, and the browser lets
     * the page make sound from then on.
     */
    setEnabled: (next: boolean) => {
      preference.write(next);

      if (next) {
        beep();
      }
    },
  };
}
