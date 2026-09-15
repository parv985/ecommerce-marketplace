import type { MongoMemoryServer } from "mongodb-memory-server";

/*
 * One-time vitest bootstrap. When MONGODB_URI is configured (the
 * project's normal dev/CI setup) this is a no-op and the suite runs
 * against that database exactly as before. When it is missing — a
 * fresh checkout or a sandbox without a local mongod — an ephemeral
 * in-memory MongoDB is started once for the whole run so the
 * integration suite stays runnable anywhere.
 */
declare global {
  // eslint-disable-next-line no-var
  var __auditTestMongod: MongoMemoryServer | undefined;
}

export default async (): Promise<void> => {
  if (process.env.MONGODB_URI) return;

  const { MongoMemoryServer: createServer } =
    await import("mongodb-memory-server");
  const mongod = await createServer.create();
  globalThis.__auditTestMongod = mongod;
  process.env.MONGODB_URI = mongod.getUri("ecommerce_marketplace_test");
};

export async function teardown(): Promise<void> {
  await globalThis.__auditTestMongod?.stop();
}
