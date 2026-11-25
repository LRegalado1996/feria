import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import type { PoolClient } from "pg";
import { afterEach, describe, expect, test, vi } from "vitest";

// drizzle-orm 0.45.4 runs a transaction's `begin` before the `try` whose
// `finally` releases the pool client. `patches/drizzle-orm@0.45.4.patch`
// backports 1.0.0-rc.6's release; these tests run the patched module against
// a real pg pool, which never evicts a client checked out of it on its own:
// a client a transaction does not release keeps its slot for good.

type ConnectCallback = Parameters<Pool["connect"]>[0];

const opened: Pool[] = [];

afterEach(async () => {
  await Promise.all(
    opened.splice(0).map(async (pool) => {
      await pool.end();
    })
  );
});

/** The connection that closes others from the server's side. */
function openAdminPool(): Pool {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  // An idle client the server closes is the pool's to replace.
  pool.on("error", () => undefined);
  opened.push(pool);

  return pool;
}

/**
 * A pool whose next checkout hands out a client whose connection the server
 * has just closed, as when Neon's pooler drops a socket between the
 * checkout and the transaction's `begin`.
 */
class DroppingPool extends Pool {
  #dropNext = false;

  readonly #admin: Pool;

  constructor(admin: Pool) {
    super({
      connectionString: process.env.DATABASE_URL,
      // Short, so a slot that never comes back fails the waiting checkout
      // fast. One slot: a client kept checked out blocks the next one.
      connectionTimeoutMillis: 1000,
      max: 1,
    });
    this.#admin = admin;
    this.on("error", () => undefined);
    opened.push(this);
  }

  dropNextCheckout() {
    this.#dropNext = true;
  }

  override connect(): Promise<PoolClient>;
  override connect(callback: ConnectCallback): void;
  override connect(
    callback?: ConnectCallback
  ): Promise<PoolClient> | undefined {
    if (callback) {
      super.connect(callback);

      return undefined;
    }

    return this.#checkout();
  }

  async #checkout(): Promise<PoolClient> {
    const client = await super.connect();

    if (this.#dropNext) {
      this.#dropNext = false;
      await terminate(this.#admin, client);
    }

    return client;
  }
}

/** Closes `client`'s connection from the server's side and waits for it. */
async function terminate(admin: Pool, client: PoolClient): Promise<void> {
  const { rows } = await client.query<{ pid: number }>(
    "select pg_backend_pid() as pid"
  );
  const closed = new Promise<void>((resolve) => {
    client.once("error", () => {
      resolve();
    });
  });
  await admin.query("select pg_terminate_backend($1)", [rows[0]?.pid]);
  await closed;
}

function setup() {
  const admin = openAdminPool();
  const pool = new DroppingPool(admin);
  const db = drizzle(pool);

  return {
    admin,
    db,
    pool,
    /** One more transaction on the pool's only slot: whether it gets it. */
    selectOne: async () =>
      await db.transaction(async (tx) => {
        const { rows } = await tx.execute<{ one: number }>(
          sql`select 1 as one`
        );

        return rows[0]?.one;
      }),
  };
}

describe("db.transaction releases its pool client", () => {
  test("a begin that fails on a dropped connection gives the client back, discarded, and the next transaction gets the slot", async () => {
    const { db, pool, selectOne } = setup();
    const body = vi.fn(async () => await Promise.resolve("ran"));
    pool.dropNextCheckout();

    await expect(db.transaction(body)).rejects.toMatchObject({
      message: "Failed query: begin\nparams: ",
    });
    expect(body).not.toHaveBeenCalled();
    // Unpatched, the dead client still holds the only slot (1 and 0) and the
    // next checkout times out.
    expect({ idle: pool.idleCount, total: pool.totalCount }).toEqual({
      idle: 0,
      total: 0,
    });
    expect(await selectOne()).toBe(1);
  });

  test("a connection dropped inside the transaction rethrows the body's own error, not the rollback's, and frees the slot", async () => {
    const { admin, db, pool, selectOne } = setup();

    await expect(
      db.transaction(async (tx) => {
        const { rows } = await tx.execute<{ pid: number }>(
          sql`select pg_backend_pid() as pid`
        );
        await admin.query("select pg_terminate_backend($1)", [rows[0]?.pid]);
        // Fails once the server has closed it: the connection is gone.
        await expect(tx.execute(sql`select pg_sleep(1)`)).rejects.toMatchObject(
          { message: "Failed query: select pg_sleep(1)\nparams: " }
        );
        throw new Error("the body failed");
      })
    ).rejects.toMatchObject({ message: "the body failed" });
    expect(pool.totalCount).toBe(0);
    expect(await selectOne()).toBe(1);
  });

  test("control: a body that fails on a healthy connection rolls back and keeps the client in the pool", async () => {
    const { db, pool, selectOne } = setup();

    await expect(
      db.transaction(async (tx) => {
        // On the pool's one connection: a table only this session sees.
        await tx.execute(sql`create temp table rollback_probe (id int)`);
        throw new Error("refused on purpose");
      })
    ).rejects.toMatchObject({ message: "refused on purpose" });
    expect({ idle: pool.idleCount, total: pool.totalCount }).toEqual({
      idle: 1,
      total: 1,
    });
    expect(await selectOne()).toBe(1);
    // Rolled back: without the rollback the next transaction's begin would
    // only warn, and its commit would keep the table.
    const { rows } = await db.execute<{ probe: string | null }>(
      sql`select to_regclass('pg_temp.rollback_probe')::text as probe`
    );
    expect(rows).toEqual([{ probe: null }]);
  });
});
