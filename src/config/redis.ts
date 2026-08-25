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

let redisClient: { get: (key: string) => Promise<string | null>; set: (key: string, value: string, ...args: unknown[]) => Promise<unknown>; del: (...keys: string[]) => Promise<unknown>; keys: (pattern: string) => Promise<string[]> } | null = null;

const REDIS_URL = process.env.REDIS_URL;

export const getRedisClient = async (): Promise<typeof redisClient> => {
  if (redisClient) return redisClient;

  if (!REDIS_URL) {
    return null;
  }

  try {
    // Dynamic import to avoid errors when Redis is not installed
    const RedisModule = await import("ioredis");
    const RedisClass = (RedisModule as any).default ?? (RedisModule as any).Redis;
    redisClient = new RedisClass(REDIS_URL);

    await (redisClient as any).ping();
    console.log("[REDIS] Connected to Redis");

    return redisClient;
  } catch (error) {
    console.warn("[REDIS] Failed to connect to Redis, caching disabled:", error);
    return null;
  }
};

export const CACHE_TTL = {
  PRODUCT_CATALOG: 60, // 1 minute
  PRODUCT_DETAIL: 120, // 2 minutes
  CATEGORY_LIST: 300, // 5 minutes
};

const CACHE_PREFIX = "ecommerce:";

export const getCacheKey = (...parts: string[]): string => {
  return CACHE_PREFIX + parts.join(":");
};

export const getFromCache = async <T>(
  key: string,
): Promise<T | null> => {
  const client = await getRedisClient();

  if (!client) return null;

  try {
    const data = await client.get(key);
    if (!data) return null;

    return JSON.parse(data) as T;
  } catch (error) {
    console.error("[REDIS] Cache get error:", error);
    return null;
  }
};

export const setCache = async (
  key: string,
  value: unknown,
  ttlSeconds: number,
): Promise<void> => {
  const client = await getRedisClient();

  if (!client) return;

  try {
    await client.set(
      key,
      JSON.stringify(value),
      "EX",
      ttlSeconds,
    );
  } catch (error) {
    console.error("[REDIS] Cache set error:", error);
  }
};

export const invalidateCache = async (
  pattern: string,
): Promise<void> => {
  const client = await getRedisClient();

  if (!client) return;

  try {
    const keys = await client.keys(pattern);
    if (keys.length > 0) {
      await client.del(...keys);
      console.log(`[REDIS] Invalidated ${keys.length} cache keys matching: ${pattern}`);
    }
  } catch (error) {
    console.error("[REDIS] Cache invalidation error:", error);
  }
};
