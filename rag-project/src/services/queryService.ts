import { retrieveSimilarChunks, hybridSearch } from '../rag/retriever';
import { generateAnswer } from '../rag/generator';
import { checkGuardrails, checkConfidence, getSafeResponse } from '../middleware/guardrails';
import { QueryRequest, QueryResult, SourceDocument } from '../models/types';
import { query } from '../db/pool';
import { cacheGet, cacheSet } from './cacheService';
import { logger } from '../utils/logger';
import crypto from 'crypto';

// ─── Main RAG query pipeline ──────────────────────────────────────────────────
export async function processQuery(
  tenantId: string,
  req:      QueryRequest & { useHybridSearch?: boolean }
): Promise<QueryResult> {
  const startTime = Date.now();

  // ── 1. Input guardrail check ────────────────────────────────────────────────
  const guardrail = checkGuardrails(req.question);
  if (guardrail.blocked) {
    const reason = guardrail.reason!;
    const result: QueryResult = {
      answer:             getSafeResponse(reason),
      sources:            [],
      confidence:         0,
      guardrailTriggered: true,
      guardrailReason:    reason,
      latencyMs:          Date.now() - startTime,
    };
    await logQuery(tenantId, req.question, result);
    return result;
  }

  const safeQuestion = guardrail.sanitizedInput || req.question;

  // ── 2. Check cache for identical question ───────────────────────────────────
  const cacheKey = buildCacheKey(tenantId, safeQuestion);
  const cached   = await cacheGet(cacheKey);
  if (cached) {
    logger.debug('Cache hit for query', { tenantId });
    return JSON.parse(cached) as QueryResult;
  }

  try {
    // ── 3. Retrieve relevant chunks (tenant-isolated) ───────────────────────
    const maxSources = req.maxSources ?? 5;
    const chunks     = req.useHybridSearch
      ? await hybridSearch(tenantId, safeQuestion, maxSources)
      : await retrieveSimilarChunks(tenantId, safeQuestion, maxSources);

    // ── 4. Low-confidence guardrail ─────────────────────────────────────────
    if (chunks.length === 0) {
      const result: QueryResult = {
        answer:             getSafeResponse('low_confidence'),
        sources:            [],
        confidence:         0,
        guardrailTriggered: true,
        guardrailReason:    'low_confidence',
        latencyMs:          Date.now() - startTime,
      };
      await logQuery(tenantId, safeQuestion, result);
      return result;
    }

    // ── 5. Generate answer from LLM ─────────────────────────────────────────
    const { answer, confidence } = await generateAnswer(safeQuestion, chunks);

    // ── 6. Post-generation confidence check ─────────────────────────────────
    const confidenceGuard = checkConfidence(confidence);

    const sources: SourceDocument[] = chunks.map((c) => ({
      documentId:   c.documentId,
      documentName: c.documentName,
      content:      c.content.slice(0, 300) + (c.content.length > 300 ? '...' : ''),
      similarity:   c.similarity,
      chunkIndex:   c.chunkIndex,
    }));

    const result: QueryResult = {
      answer:             confidenceGuard.blocked ? getSafeResponse('low_confidence') : answer,
      sources:            confidenceGuard.blocked ? [] : sources,
      confidence,
      guardrailTriggered: confidenceGuard.blocked,
      guardrailReason:    confidenceGuard.blocked ? 'low_confidence' : undefined,
      latencyMs:          Date.now() - startTime,
    };

    // ── 7. Cache result ─────────────────────────────────────────────────────
    await cacheSet(cacheKey, JSON.stringify(result), 600);

    // ── 8. Log query for audit ──────────────────────────────────────────────
    await logQuery(tenantId, safeQuestion, result);

    logger.info('Query processed', {
      tenantId,
      confidence,
      chunks:    chunks.length,
      latencyMs: result.latencyMs,
    });

    return result;

  } catch (err) {
    logger.error('Query processing error', {
      tenantId,
      error: (err as Error).message,
    });
    throw err;
  }
}

// ─── Retrieve query history ───────────────────────────────────────────────────
export async function getQueryHistory(
  tenantId: string,
  page  = 1,
  limit = 20
): Promise<{ logs: unknown[]; total: number }> {
  const offset = (page - 1) * limit;

  const [logs, countRows] = await Promise.all([
    query(
      `SELECT id, query_text, answer_text, confidence, guardrail_triggered,
              guardrail_reason, chunks_retrieved, latency_ms, created_at
       FROM query_logs
       WHERE tenant_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [tenantId, limit, offset]
    ),
    query<{ count: string }>(
      'SELECT COUNT(*)::int AS count FROM query_logs WHERE tenant_id = $1',
      [tenantId]
    ),
  ]);

  return { logs, total: parseInt(countRows[0]?.count || '0') };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function buildCacheKey(tenantId: string, question: string): string {
  const hash = crypto.createHash('sha256').update(question.toLowerCase()).digest('hex');
  return `query:${tenantId}:${hash}`;
}

async function logQuery(
  tenantId:  string,
  question:  string,
  result:    QueryResult
): Promise<void> {
  try {
    await query(
      `INSERT INTO query_logs
         (tenant_id, query_text, answer_text, confidence, guardrail_triggered,
          guardrail_reason, chunks_retrieved, latency_ms)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        tenantId,
        question.slice(0, 1000),
        result.answer.slice(0, 2000),
        result.confidence,
        result.guardrailTriggered,
        result.guardrailReason || null,
        result.sources.length,
        result.latencyMs,
      ]
    );
  } catch (err) {
    logger.warn('Failed to log query', { error: (err as Error).message });
  }
}
