import { Pool, PoolClient } from 'pg';
import { logger } from '../utils/logger';

// ─── Singleton Pool Instance ───────────────────────────────────────────────────
let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      host:               process.env.DB_HOST     || 'localhost',
      port:               parseInt(process.env.DB_PORT || '5432'),
      database:           process.env.DB_NAME     || 'rag_db',
      user:               process.env.DB_USER     || 'postgres',
      password:           process.env.DB_PASSWORD || 'postgres',
      max:                parseInt(process.env.DB_POOL_MAX || '20'),
      idleTimeoutMillis:  parseInt(process.env.DB_POOL_IDLE_TIMEOUT || '30000'),
      connectionTimeoutMillis: parseInt(process.env.DB_POOL_CONNECTION_TIMEOUT || '2000'),
      ssl: process.env.NODE_ENV === 'production'
        ? { rejectUnauthorized: false }
        : undefined,
    });

    pool.on('error', (err) => {
      logger.error('Unexpected PostgreSQL pool error', { error: err.message });
    });

    pool.on('connect', () => {
      logger.debug('New PostgreSQL connection established');
    });
  }

  return pool;
}

// ─── Execute a query with automatic client release ────────────────────────────
export async function query<T = Record<string, unknown>>(
  text: string,
  params?: unknown[]
): Promise<T[]> {
  const start = Date.now();
  const client = await getPool().connect();
  try {
    const result = await client.query(text, params);
    const duration = Date.now() - start;
    logger.debug('Query executed', { duration, rows: result.rowCount });
    return result.rows as T[];
  } finally {
    client.release();
  }
}

// ─── Transaction helper ───────────────────────────────────────────────────────
export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ─── Health check ─────────────────────────────────────────────────────────────
export async function checkDatabaseConnection(): Promise<boolean> {
  try {
    await query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}

// ─── Graceful shutdown ────────────────────────────────────────────────────────
export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    logger.info('PostgreSQL pool closed');
  }
}
