/**
 * Redis configuration for product catalog caching.
 *
 * When REDIS_URL is configured, the product catalog listing endpoint
 * caches results to reduce database load. Cache is invalidated when
 * products are created, updated, or deactivated.
 *
 * When Redis is not configured, caching is silently disabled and
 * all queries go directly to MongoDB.
 */

type RedisClient = {
  get: (key: string) => Promise<string | null>;
  set: (...args: any[]) => Promise<any>;
  del: (...keys: string[]) => Promise<any>;
  keys: (pattern: string) => Promise<string[]>;
  disconnect: () => void;
};

let redisClient: RedisClient | null = null;
let redisAttempted = false;

const REDIS_URL = process.env.REDIS_URL;
const REDIS_CONNECT_TIMEOUT_MS = 2000;

export const getRedisClient = async (): Promise<RedisClient | null> => {
  if (redisClient) return redisClient;

  if (!REDIS_URL || redisAttempted) {
    return null;
  }

  redisAttempted = true;

  try {
    const RedisModule = await import("ioredis");
    const RedisClass = (RedisModule as any).default ?? (RedisModule as any).Redis;
    const client: any = new RedisClass(REDIS_URL, {
      connectTimeout: REDIS_CONNECT_TIMEOUT_MS,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      retryStrategy: () => null,
      lazyConnect: true,
    });

    // Suppress unhandled error events
    client.on("error", (err: any) => {
      // Silently ignore - we already handle the failure
      if (redisClient === client) {
        redisClient = null;
      }
      try { client.disconnect(); } catch { /* ignore */ }
    });

    await client.connect();

    await Promise.race([
      client.ping(),
      new Promise<void>((_, reject) =>
        setTimeout(() => reject(new Error("Redis connection timed out")), REDIS_CONNECT_TIMEOUT_MS)
      ),
    ]);

    console.log("[REDIS] Connected to Redis");
    redisClient = client as RedisClient;
    return redisClient;
  } catch (error) {
    console.warn("[REDIS] Redis unavailable, caching disabled.");
    redisClient = null;
    return null;
  }
};

export const CACHE_TTL = {
  PRODUCT_CATALOG: 60,
  PRODUCT_DETAIL: 120,
  CATEGORY_LIST: 300,
};

const CACHE_PREFIX = "ecommerce:";

export const getCacheKey = (...parts: string[]): string => {
  return CACHE_PREFIX + parts.join(":");
};

export const getFromCache = async <T>(key: string): Promise<T | null> => {
  try {
    const client = await getRedisClient();
    if (!client) return null;
    const data = await client.get(key);
    if (!data) return null;
    return JSON.parse(data) as T;
  } catch {
    return null;
  }
};

export const setCache = async (key: string, value: unknown, ttlSeconds: number): Promise<void> => {
  try {
    const client = await getRedisClient();
    if (!client) return;
    await client.set(key, JSON.stringify(value), "EX", ttlSeconds);
  } catch {
    // silently ignore
  }
};

export const invalidateCache = async (pattern: string): Promise<void> => {
  try {
    const client = await getRedisClient();
    if (!client) return;
    const keys = await client.keys(pattern);
    if (keys.length > 0) {
      await client.del(...keys);
    }
  } catch {
    // silently ignore
  }
};
