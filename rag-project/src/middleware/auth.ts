import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { query } from '../db/pool';
import { JwtPayload, Tenant } from '../models/types';
import { logger } from '../utils/logger';

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      tenant?: Tenant;
      tenantId?: string;
    }
  }
}

// ─── Verify JWT token from Authorization header ────────────────────────────────
export async function authenticate(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        success: false,
        error: 'Missing or invalid Authorization header. Use: Bearer <token>',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const token = authHeader.split(' ')[1];
    const secret = process.env.JWT_SECRET;

    if (!secret) {
      throw new Error('JWT_SECRET is not configured');
    }

    // Verify and decode
    const decoded = jwt.verify(token, secret) as JwtPayload;

    // Fetch tenant from DB to ensure they still exist and are active
    const rows = await query<Tenant>(
      `SELECT id, name, email, api_key, password_hash, is_active, metadata, created_at, updated_at
       FROM tenants
       WHERE id = $1 AND is_active = true`,
      [decoded.tenantId]
    );

    if (rows.length === 0) {
      res.status(401).json({
        success:   false,
        error:     'Tenant not found or inactive',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // Attach tenant to request
    req.tenant   = rows[0];
    req.tenantId = rows[0].id;

    next();
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      res.status(401).json({
        success:   false,
        error:     'Token expired. Please log in again.',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    if (err instanceof jwt.JsonWebTokenError) {
      res.status(401).json({
        success:   false,
        error:     'Invalid token.',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    logger.error('Auth middleware error', { error: (err as Error).message });
    res.status(500).json({
      success:   false,
      error:     'Internal server error during authentication',
      timestamp: new Date().toISOString(),
    });
  }
}

// ─── Verify tenantId in URL matches authenticated tenant ──────────────────────
export function verifyTenantAccess(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const { tenantId } = req.params;

  if (!tenantId) {
    next();
    return;
  }

  if (req.tenantId !== tenantId) {
    logger.warn('SECURITY: Tenant tried to access another tenant resource', {
      authTenant:     req.tenantId,
      requestedTenant: tenantId,
      path:           req.path,
    });
    res.status(403).json({
      success:   false,
      error:     'Access denied. You can only access your own resources.',
      timestamp: new Date().toISOString(),
    });
    return;
  }

  next();
}

// ─── Generate JWT token ────────────────────────────────────────────────────────
export function generateToken(payload: JwtPayload): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET is not configured');

  return jwt.sign(payload, secret, {
    expiresIn: (process.env.JWT_EXPIRES_IN || '24h') as jwt.SignOptions['expiresIn'],
  });
}
