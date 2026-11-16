import { randomInt } from "node:crypto";

/**
 * A value no other test holds, for the names and slugs a test gives its rows
 * in the one store every spec shares (FER-038): a whole UUID, never a short
 * random suffix (docs/agents/testing.md § Falsifiability). Lowercase hex and
 * dashes, so a name ending in it slugs to itself (`Collares <tag>` is
 * `collares-<tag>`).
 */
export function uniqueTag(): string {
  return crypto.randomUUID();
}

/** Workers that can run at once, each with its own block of phones. */
const PHONE_BLOCKS = 100;

/** A block: the seven free digits of a `+5989…` mobile, split in a hundred. */
const PHONES_PER_BLOCK = 100_000;

/**
 * The seven free digits of worker `slot`'s phones, one call each: its own
 * block, counted through from `start` and wrapping inside the block, so no
 * call repeats an earlier one and no other block's worker can hold it.
 */
export function phoneSequence(slot: number, start: number): () => string {
  let issued = 0;

  return () => {
    if (!Number.isInteger(slot) || slot < 0 || slot >= PHONE_BLOCKS) {
      throw new RangeError(
        `Worker ${slot} has no block of phones: they hold ${PHONE_BLOCKS} workers`
      );
    }

    if (issued === PHONES_PER_BLOCK) {
      throw new RangeError(`Worker ${slot} handed out every phone it holds`);
    }

    const offset = (start + issued) % PHONES_PER_BLOCK;
    issued += 1;

    return String(slot * PHONES_PER_BLOCK + offset).padStart(7, "0");
  };
}

// Playwright gives the workers running at once different parallel indexes,
// so their blocks never meet. The count starts at random, so a worker
// restarted after a failure, or a later run over the rows a failed teardown
// left, is unlikely to meet a phone handed out before.
const nextPhone = phoneSequence(
  Number(process.env.TEST_PARALLEL_INDEX ?? "0"),
  randomInt(PHONES_PER_BLOCK)
);

/**
 * A Uruguayan mobile for one test's orders: stored as `+5989…`, typed by a
 * shopper or the staff in its local form (`09X XXX XXX`). The hourly limit
 * counts a phone's orders across the whole store, and so does a search by
 * phone, so no two tests running at once share one (`phoneSequence`), never
 * a short random number (docs/agents/testing.md § Falsifiability). A whole
 * order code typed in the search is read as a code, never as phone digits,
 * so a phone may hold another order's code digits without that search
 * finding it.
 */
export function uniquePhone(): {
  /** The eight digits after `+598`, as no masked page may show them. */
  national: string;
  international: string;
  local: string;
} {
  const digits = nextPhone();

  return {
    international: `+5989${digits}`,
    local: `09${digits.slice(0, 1)} ${digits.slice(1, 4)} ${digits.slice(4)}`,
    national: `9${digits}`,
  };
}
