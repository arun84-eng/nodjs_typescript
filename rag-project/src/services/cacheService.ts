import { createClient, RedisClientType } from 'redis';
import { logger } from '../utils/logger';

let redisClient: RedisClientType | null = null;

export async function getRedisClient(): Promise<RedisClientType | null> {
  if (!process.env.REDIS_URL) return null;

  if (!redisClient) {
    try {
      redisClient = createClient({ url: process.env.REDIS_URL }) as RedisClientType;
      redisClient.on('error', (err) => logger.warn('Redis error', { error: err.message }));
      await redisClient.connect();
      logger.info('Redis connected');
    } catch (err) {
      logger.warn('Redis unavailable, running without cache', { error: (err as Error).message });
      redisClient = null;
    }
  }
  return redisClient;
}

export async function cacheGet(key: string): Promise<string | null> {
  const client = await getRedisClient();
  if (!client) return null;
  try {
    return await client.get(key);
  } catch {
    return null;
  }
}

export async function cacheSet(
  key: string,
  value: string,
  ttlSeconds = 3600
): Promise<void> {
  const client = await getRedisClient();
  if (!client) return;
  try {
    await client.setEx(key, ttlSeconds, value);
  } catch (err) {
    logger.warn('Cache set failed', { error: (err as Error).message });
  }
}

export async function cacheDelete(pattern: string): Promise<void> {
  const client = await getRedisClient();
  if (!client) return;
  try {
    const keys = await client.keys(pattern);
    if (keys.length > 0) await client.del(keys);
  } catch (err) {
    logger.warn('Cache delete failed', { error: (err as Error).message });
  }
}

export async function closeRedis(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
  }
}
