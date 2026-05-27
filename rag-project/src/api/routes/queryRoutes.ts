import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, verifyTenantAccess } from '../../middleware/auth';
import { validate, querySchema } from '../../middleware/validation';
import { processQuery, getQueryHistory } from '../../services/queryService';
import { retrieveSimilarChunks } from '../../rag/retriever';
import { generateEmbedding } from '../../rag/embeddings';
import { generateAnswerStream } from '../../rag/generator';
import { checkGuardrails, getSafeResponse } from '../../middleware/guardrails';
import { logger } from '../../utils/logger';

const router = Router({ mergeParams: true });

// ─── POST /tenant/:tenantId/query — Main RAG query ────────────────────────────
router.post(
  '/',
  authenticate,
  verifyTenantAccess,
  validate(querySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { question, maxSources, useHybridSearch, stream } = req.body;

      // ── Streaming response ────────────────────────────────────────────────
      if (stream) {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        const guardrail = checkGuardrails(question);
        if (guardrail.blocked) {
          res.write(`data: ${JSON.stringify({ type: 'error', message: getSafeResponse(guardrail.reason!) })}\n\n`);
          res.end();
          return;
        }

        const chunks = await retrieveSimilarChunks(req.params.tenantId, guardrail.sanitizedInput!);

        if (chunks.length === 0) {
          res.write(`data: ${JSON.stringify({ type: 'error', message: getSafeResponse('low_confidence') })}\n\n`);
          res.end();
          return;
        }

        // Send sources first
        const sources = chunks.map((c) => ({
          documentId:   c.documentId,
          documentName: c.documentName,
          similarity:   c.similarity,
        }));
        res.write(`data: ${JSON.stringify({ type: 'sources', sources })}\n\n`);

        // Stream answer tokens
        const generator = generateAnswerStream(guardrail.sanitizedInput!, chunks);
        for await (const token of generator) {
          res.write(`data: ${JSON.stringify({ type: 'token', content: token })}\n\n`);
        }

        res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
        res.end();
        return;
      }

      // ── Standard JSON response ─────────────────────────────────────────────
      const result = await processQuery(req.params.tenantId, {
        question,
        maxSources,
        useHybridSearch,
      });

      res.json({
        success:   true,
        data:      result,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  }
);

// ─── GET /tenant/:tenantId/query/history — Query history ──────────────────────
router.get(
  '/history',
  authenticate,
  verifyTenantAccess,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const page  = parseInt(String(req.query.page  || '1'));
      const limit = parseInt(String(req.query.limit || '20'));

      const { logs, total } = await getQueryHistory(req.params.tenantId, page, limit);

      res.json({
        success:   true,
        data:      logs,
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
