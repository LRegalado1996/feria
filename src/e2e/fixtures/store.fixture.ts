import type { UpdateStoreValues } from "../../lib/schemas/store";
import { test as dbTest } from "./db.fixture";
import { STORE_SETTINGS, writeStoreSettings } from "./store-settings";
import {
  IGNORE_HTTPS_ERRORS,
  requireBaseURL,
  workerBaseURL,
} from "./user.fixture";

/** Changes to the store's settings for one serial test. */
export interface StoreEdit {
  /**
   * Sends `body` to `store.update` as an admin, whatever it holds, and
   * answers the status: for the edits the API must refuse.
   */
  send: (body: Record<string, unknown>) => Promise<number>;
  /**
   * Writes `STORE_SETTINGS` with `changes` over them through `store.update`,
   * as an admin, and requires the write to succeed.
   */
  update: (changes: Partial<UpdateStoreValues>) => Promise<void>;
}

export interface StoreFixtures {
  /**
   * See `StoreEdit`. The run's settings are written back when the test ends,
   * whatever it did. Only a `*.serial.e2e.ts` spec may ask for it.
   */
  storeEdit: StoreEdit;
}

export interface StoreWorkerFixtures {
  /** The settings the store holds while this worker's tests run. */
  storeSettings: typeof STORE_SETTINGS;
}

/** What only one test at a time may do: the serial project's specs. */
const SERIAL_SPEC = ".serial.e2e.ts";

export const test = dbTest.extend<StoreFixtures, StoreWorkerFixtures>({
  // Before any test of the worker, whatever the spec: the values are the same
  // in every worker, so one starting while another runs changes nothing it
  // reads, and the edit drops whatever an earlier run left cached.
  storeSettings: [
    async ({ playwright, workerUser }, use) => {
      const request = await playwright.request.newContext({
        baseURL: workerBaseURL(),
        ignoreHTTPSErrors: IGNORE_HTTPS_ERRORS,
        storageState: workerUser.storageState,
      });

      try {
        await writeStoreSettings(request, STORE_SETTINGS);
      } finally {
        await request.dispose();
      }

      await use(STORE_SETTINGS);
    },
    { auto: true, scope: "worker" },
  ],

  storeEdit: async ({ baseURL, playwright, workerUser }, use, testInfo) => {
    // A parallel spec reads these settings while this one would change them.
    if (!testInfo.file.endsWith(SERIAL_SPEC)) {
      throw new Error(
        `Only a *.serial.e2e.ts spec may change the store's settings: ${testInfo.file}`
      );
    }

    const request = await playwright.request.newContext({
      baseURL: requireBaseURL(baseURL),
      ignoreHTTPSErrors: IGNORE_HTTPS_ERRORS,
      storageState: workerUser.storageState,
    });

    try {
      await use({
        send: async (body) => {
          const response = await request.post("/api/orpc/store/update", {
            data: { json: body },
          });

          return response.status();
        },
        update: async (changes) => {
          await writeStoreSettings(request, { ...STORE_SETTINGS, ...changes });
        },
      });
    } finally {
      // Whatever the test did or failed to do, the next one reads these.
      try {
        await writeStoreSettings(request, STORE_SETTINGS);
      } finally {
        await request.dispose();
      }
    }
  },
});
