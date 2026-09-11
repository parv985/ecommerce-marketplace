import mongoose from "mongoose";

/*
 * Multi-document transaction helper.
 *
 * Money-moving flows (return refunds and their rollbacks) must never
 * leave half-applied state behind, so every write in those flows runs
 * inside a single MongoDB transaction when the deployment supports it.
 *
 * A standalone mongod (no replica set) cannot run transactions. Rather
 * than making those flows unusable in development, support is probed
 * once and cached: on a standalone the work runs as an ordered sequence
 * of individually atomic writes. The flows are written to be
 * idempotent and resumable (each step is claimed before it runs), so a
 * failure part-way through is repaired by re-running the same
 * operation instead of by a transaction abort.
 *
 * `src/config/database.ts` enables `transactionAsyncLocalStorage`, so
 * every Mongoose operation performed inside `runInTransaction` is
 * automatically attached to the transaction session - repositories do
 * not need to thread a session argument through every call.
 */

/*
 * Enabled at module scope (not only inside connectDatabase) so the
 * behaviour also holds for anything that connects on its own, such as
 * the integration test suite.
 */
mongoose.set("transactionAsyncLocalStorage", true);

const PROBE_COLLECTION = "__transaction_probe";

let cachedSupport: boolean | null = null;

/*
 * Detects transaction support with a throwaway insert+delete. Reads are
 * not enough on their own, so a real (trivially small) write is used;
 * on a standalone the server rejects it with "Transaction numbers are
 * only allowed on a replica set member or mongos".
 */
export const areTransactionsSupported =
  async (): Promise<boolean> => {
    if (cachedSupport !== null) {
      return cachedSupport;
    }

    const session = await mongoose.startSession();

    try {
      await session.withTransaction(async () => {
        const probe =
          mongoose.connection.collection(
            PROBE_COLLECTION,
          );

        /*
         * A write is required: reads alone do not prove the server
         * accepts transaction numbers. A delete that matches nothing
         * is the cheapest possible write.
         */
        await probe.deleteOne(
          { key: "probe" },
          { session },
        );
      });

      cachedSupport = true;
    } catch {
      cachedSupport = false;
    } finally {
      await session.endSession();
    }

    return cachedSupport;
  };

/* Test hook: forgets the cached probe result. */
export const resetTransactionSupportCache = (): void => {
  cachedSupport = null;
};

export interface TransactionOutcome<T> {
  value: T;
  /* False when the deployment could not run a transaction. */
  transactional: boolean;
}

/*
 * Runs `work` as a single transaction when possible. The callback may
 * be invoked more than once (the driver retries transient commit
 * conflicts), so it must stay idempotent - claim each step before
 * performing it.
 */
export const runInTransaction = async <T>(
  work: () => Promise<T>,
): Promise<TransactionOutcome<T>> => {
  if (!(await areTransactionsSupported())) {
    return {
      value: await work(),
      transactional: false,
    };
  }

  const session = await mongoose.startSession();

  try {
    const value = await session.withTransaction(
      async () => work(),
    );

    return { value, transactional: true };
  } finally {
    await session.endSession();
  }
};
