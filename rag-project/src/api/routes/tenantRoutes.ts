import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import {
  createTenant,
  loginTenant,
  getTenantById,
  getTenantStats,
  rotateApiKey,
} from '../../services/tenantService';
import { authenticate, verifyTenantAccess } from '../../middleware/auth';
import { validate, createTenantSchema, loginSchema } from '../../middleware/validation';

const router = Router();

// ─── POST /tenant — Register new tenant ───────────────────────────────────────
router.post(
  '/',
  validate(createTenantSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await createTenant(req.body);
      res.status(201).json({
        success:   true,
        message:   'Tenant created successfully',
        data:      result,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  }
);

// ─── POST /tenant/login — Login ───────────────────────────────────────────────
router.post(
  '/login',
  validate(loginSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await loginTenant(req.body.email, req.body.password);
      res.status(200).json({
        success:   true,
        message:   'Login successful',
        data:      result,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  }
);

// ─── GET /tenant/:id — Get tenant profile ─────────────────────────────────────
router.get(
  '/:id',
  authenticate,
  verifyTenantAccess,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenant = await getTenantById(req.params.id);
      res.json({
        success:   true,
        data:      tenant,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  }
);

// ─── GET /tenant/:id/stats — Get usage stats ──────────────────────────────────
router.get(
  '/:id/stats',
  authenticate,
  verifyTenantAccess,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const stats = await getTenantStats(req.params.id);
      res.json({
        success:   true,
        data:      stats,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  }
);

// ─── POST /tenant/:id/rotate-key — Rotate API key ─────────────────────────────
router.post(
  '/:id/rotate-key',
  authenticate,
  verifyTenantAccess,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const newKey = await rotateApiKey(req.params.id);
      res.json({
        success:   true,
        message:   'API key rotated successfully',
        data:      { apiKey: newKey },
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
