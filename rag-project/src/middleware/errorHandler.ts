import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { logger } from '../utils/logger';

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly isOperational = true
  ) {
    super(message);
    this.name = 'AppError';
    Error.captureStackTrace(this, this.constructor);
  }
}

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Zod validation errors
  if (err instanceof ZodError) {
    res.status(400).json({
      success:   false,
      error:     'Validation failed',
      details:   err.errors.map((e) => ({ field: e.path.join('.'), message: e.message })),
      timestamp: new Date().toISOString(),
    });
    return;
  }

  // App-level operational errors
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success:   false,
      error:     err.message,
      timestamp: new Date().toISOString(),
    });
    return;
  }

  // Unknown errors — log fully, return generic message
  logger.error('Unhandled error', {
    error:  err.message,
    stack:  err.stack,
    path:   req.path,
    method: req.method,
  });

  res.status(500).json({
    success:   false,
    error:     'An unexpected error occurred. Please try again later.',
    timestamp: new Date().toISOString(),
  });
}

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    success:   false,
    error:     `Route not found: ${req.method} ${req.path}`,
    timestamp: new Date().toISOString(),
  });
}
