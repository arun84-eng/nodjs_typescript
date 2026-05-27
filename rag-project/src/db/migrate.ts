import * as fs from 'fs';
import * as path from 'path';
import { getPool, closePool } from './pool';
import { logger } from '../utils/logger';
import dotenv from 'dotenv';

dotenv.config();

async function migrate(): Promise<void> {
  const pool = getPool();
  const client = await pool.connect();

  try {
    logger.info('Running database migrations...');

    const sqlPath = path.join(__dirname, 'init.sql');
    const sql = fs.readFileSync(sqlPath, 'utf-8');

    await client.query(sql);
    logger.info('✅ Database migrations completed successfully');
  } catch (err) {
    logger.error('❌ Migration failed', { error: (err as Error).message });
    throw err;
  } finally {
    client.release();
    await closePool();
  }
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
