import { Router, Request, Response } from 'express';
import { checkDatabaseConnection } from '../../db/pool';
import { getRedisClient } from '../../services/cacheService';

const router = Router();

router.get('/', async (_req: Request, res: Response) => {
  const start = Date.now();

  const [dbOk, redisClient] = await Promise.all([
    checkDatabaseConnection(),
    getRedisClient(),
  ]);

  let redisOk = false;
  if (redisClient) {
    try {
      await redisClient.ping();
      redisOk = true;
    } catch { /* redis down */ }
  }

  const status = dbOk ? 'healthy' : 'degraded';

  res.status(dbOk ? 200 : 503).json({
    status,
    version:   process.env.npm_package_version || '1.0.0',
    timestamp: new Date().toISOString(),
    uptime:    Math.floor(process.uptime()),
    latencyMs: Date.now() - start,
    services: {
      database: dbOk    ? 'up' : 'down',
      cache:    redisOk ? 'up' : 'unavailable',
    },
  });
});

export default router;
