import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';

import tenantRoutes   from './api/routes/tenantRoutes';
import documentRoutes from './api/routes/documentRoutes';
import queryRoutes    from './api/routes/queryRoutes';
import healthRoutes   from './api/routes/healthRoutes';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { logger } from './utils/logger';

const app = express();

// ─── Security Headers ──────────────────────────────────────────────────────────
app.use(helmet({
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
    },
  },
}));

// ─── CORS ─────────────────────────────────────────────────────────────────────
app.use(cors({
  origin:      process.env.ALLOWED_ORIGINS?.split(',') || '*',
  methods:     ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// ─── Body Parsers ─────────────────────────────────────────────────────────────
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// ─── Request Logging ──────────────────────────────────────────────────────────
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('combined', {
    stream: { write: (msg) => logger.info(msg.trim()) },
  }));
}

// ─── Global Rate Limiter ──────────────────────────────────────────────────────
const globalLimiter = rateLimit({
  windowMs:         parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'),
  max:              parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'),
  standardHeaders:  true,
  legacyHeaders:    false,
  message: {
    success:   false,
    error:     'Too many requests. Please try again later.',
    timestamp: new Date().toISOString(),
  },
});
app.use(globalLimiter);

// ─── Stricter rate limit for queries (LLM calls are expensive) ────────────────
const queryLimiter = rateLimit({
  windowMs: 60_000,     // 1 minute
  max:      20,         // 20 queries/min per IP
  message: {
    success:   false,
    error:     'Query rate limit exceeded. Please wait before sending more queries.',
    timestamp: new Date().toISOString(),
  },
});

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/health',                          healthRoutes);
app.use('/tenant',                          tenantRoutes);
app.use('/tenant/:tenantId/documents',      documentRoutes);
app.use('/tenant/:tenantId/query', queryLimiter, queryRoutes);

// ─── 404 & Error Handlers ─────────────────────────────────────────────────────
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
