import { z } from 'zod';

// ─── Tenant Schemas ────────────────────────────────────────────────────────────
export const createTenantSchema = z.object({
  name: z
    .string()
    .min(2,  'Name must be at least 2 characters')
    .max(100, 'Name must be at most 100 characters')
    .trim(),
  email: z
    .string()
    .email('Invalid email address')
    .toLowerCase()
    .trim(),
  password: z
    .string()
    .min(8,  'Password must be at least 8 characters')
    .max(100, 'Password too long')
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
      'Password must contain uppercase, lowercase, and a number'
    ),
  metadata: z.record(z.unknown()).optional(),
});

export const loginSchema = z.object({
  email:    z.string().email().toLowerCase().trim(),
  password: z.string().min(1, 'Password required'),
});

// ─── Query Schema ─────────────────────────────────────────────────────────────
export const querySchema = z.object({
  question: z
    .string()
    .min(3,    'Question must be at least 3 characters')
    .max(1000, 'Question must be at most 1000 characters')
    .trim(),
  maxSources: z
    .number()
    .int()
    .min(1)
    .max(10)
    .optional()
    .default(5),
  useHybridSearch: z.boolean().optional().default(false),
  stream: z.boolean().optional().default(false),
});

// ─── Validate middleware factory ──────────────────────────────────────────────
import { Request, Response, NextFunction } from 'express';
import { ZodSchema } from 'zod';

export function validate(schema: ZodSchema, source: 'body' | 'params' | 'query' = 'body') {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const parsed = schema.parse(req[source]);
      req[source]  = parsed;
      next();
    } catch (err) {
      next(err);
    }
  };
}
