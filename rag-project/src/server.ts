import 'dotenv/config';
import app from './app';
import { checkDatabaseConnection, closePool } from './db/pool';
import { closeRedis } from './services/cacheService';
import { logger } from './utils/logger';
import * as fs from 'fs';

const PORT = parseInt(process.env.PORT || '3000');

// ─── Ensure logs directory exists ─────────────────────────────────────────────
if (!fs.existsSync('logs')) {
  fs.mkdirSync('logs', { recursive: true });
}

async function startServer(): Promise<void> {
  // Verify DB connection before starting
  const dbOk = await checkDatabaseConnection();
  if (!dbOk) {
    logger.error('❌ Cannot connect to PostgreSQL. Ensure DB is running and .env is correct.');
    process.exit(1);
  }
  logger.info('✅ PostgreSQL connected');

  const server = app.listen(PORT, () => {
    logger.info(`🚀 Server running on http://localhost:${PORT}`);
    logger.info(`📋 Environment: ${process.env.NODE_ENV || 'development'}`);
    logger.info(`🔒 Multi-Tenant RAG API ready`);
  });

  // ── Graceful shutdown ──────────────────────────────────────────────────────
  const shutdown = async (signal: string) => {
    logger.info(`${signal} received. Shutting down gracefully...`);
    server.close(async () => {
      await closePool();
      await closeRedis();
      logger.info('Server closed.');
      process.exit(0);
    });

    // Force exit after 10 seconds
    setTimeout(() => {
      logger.error('Could not close connections in time, forcing exit');
      process.exit(1);
    }, 10_000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));

  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled Promise Rejection', { reason });
  });

  process.on('uncaughtException', (err) => {
    logger.error('Uncaught Exception', { error: err.message, stack: err.stack });
    process.exit(1);
  });
}

startServer();
