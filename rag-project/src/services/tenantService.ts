import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { query } from '../db/pool';
import { generateToken } from '../middleware/auth';
import { CreateTenantDTO, Tenant, TenantPublic } from '../models/types';
import { AppError } from '../middleware/errorHandler';
import { cacheGet, cacheSet, cacheDelete } from './cacheService';
import { logger } from '../utils/logger';

// ─── Map DB row → Tenant ──────────────────────────────────────────────────────
function rowToTenant(row: Record<string, unknown>): Tenant {
  return {
    id:           row.id as string,
    name:         row.name as string,
    email:        row.email as string,
    apiKey:       row.api_key as string,
    passwordHash: row.password_hash as string,
    isActive:     row.is_active as boolean,
    metadata:     (row.metadata as Record<string, unknown>) || {},
    createdAt:    row.created_at as Date,
    updatedAt:    row.updated_at as Date,
  };
}

// ─── Sanitize for public output ───────────────────────────────────────────────
export function toPublic(tenant: Tenant): TenantPublic {
  return {
    id:        tenant.id,
    name:      tenant.name,
    email:     tenant.email,
    apiKey:    tenant.apiKey,
    isActive:  tenant.isActive,
    metadata:  tenant.metadata,
    createdAt: tenant.createdAt,
  };
}

// ─── Create a new tenant ──────────────────────────────────────────────────────
export async function createTenant(dto: CreateTenantDTO): Promise<{
  tenant: TenantPublic;
  token: string;
}> {
  // Check duplicate email
  const existing = await query('SELECT id FROM tenants WHERE email = $1', [dto.email]);
  if (existing.length > 0) {
    throw new AppError(409, 'A tenant with this email already exists');
  }

  const passwordHash = await bcrypt.hash(dto.password, 12);
  const apiKey       = `rag_${uuidv4().replace(/-/g, '')}`;

  const rows = await query<Record<string, unknown>>(
    `INSERT INTO tenants (name, email, api_key, password_hash, metadata)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [dto.name, dto.email, apiKey, passwordHash, JSON.stringify(dto.metadata || {})]
  );

  const tenant = rowToTenant(rows[0]);

  const token = generateToken({ tenantId: tenant.id, email: tenant.email });

  logger.info('Tenant created', { tenantId: tenant.id, email: tenant.email });

  return { tenant: toPublic(tenant), token };
}

// ─── Login tenant ─────────────────────────────────────────────────────────────
export async function loginTenant(
  email: string,
  password: string
): Promise<{ tenant: TenantPublic; token: string }> {
  const rows = await query<Record<string, unknown>>(
    'SELECT * FROM tenants WHERE email = $1 AND is_active = true',
    [email]
  );

  if (rows.length === 0) {
    throw new AppError(401, 'Invalid credentials');
  }

  const tenant = rowToTenant(rows[0]);
  const valid  = await bcrypt.compare(password, tenant.passwordHash);

  if (!valid) {
    throw new AppError(401, 'Invalid credentials');
  }

  const token = generateToken({ tenantId: tenant.id, email: tenant.email });

  logger.info('Tenant logged in', { tenantId: tenant.id });

  return { tenant: toPublic(tenant), token };
}

// ─── Get tenant by ID ─────────────────────────────────────────────────────────
export async function getTenantById(tenantId: string): Promise<TenantPublic> {
  const cacheKey = `tenant:${tenantId}`;
  const cached   = await cacheGet(cacheKey);
  if (cached) return JSON.parse(cached) as TenantPublic;

  const rows = await query<Record<string, unknown>>(
    'SELECT * FROM tenants WHERE id = $1 AND is_active = true',
    [tenantId]
  );

  if (rows.length === 0) {
    throw new AppError(404, 'Tenant not found');
  }

  const pub = toPublic(rowToTenant(rows[0]));
  await cacheSet(cacheKey, JSON.stringify(pub), 300);
  return pub;
}

// ─── Get tenant stats ─────────────────────────────────────────────────────────
export async function getTenantStats(tenantId: string): Promise<Record<string, unknown>> {
  const rows = await query<Record<string, unknown>>(
    `SELECT
       (SELECT COUNT(*) FROM documents WHERE tenant_id = $1 AND status = 'ready') AS document_count,
       (SELECT COUNT(*) FROM document_chunks WHERE tenant_id = $1)                AS chunk_count,
       (SELECT COUNT(*) FROM query_logs WHERE tenant_id = $1)                     AS query_count,
       (SELECT COALESCE(SUM(size_bytes), 0) FROM documents WHERE tenant_id = $1)  AS total_size_bytes`,
    [tenantId]
  );

  return rows[0];
}

// ─── Rotate API key ───────────────────────────────────────────────────────────
export async function rotateApiKey(tenantId: string): Promise<string> {
  const newKey = `rag_${uuidv4().replace(/-/g, '')}`;

  await query(
    'UPDATE tenants SET api_key = $1, updated_at = NOW() WHERE id = $2',
    [newKey, tenantId]
  );

  await cacheDelete(`tenant:${tenantId}`);
  logger.info('API key rotated', { tenantId });

  return newKey;
}
