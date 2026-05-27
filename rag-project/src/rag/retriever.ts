import { query } from '../db/pool';
import { generateEmbedding } from './embeddings';
import { RetrievedChunk } from '../models/types';
import { logger } from '../utils/logger';

const SIMILARITY_THRESHOLD = parseFloat(process.env.SIMILARITY_THRESHOLD || '0.75');
const MAX_CHUNKS            = parseInt(process.env.MAX_CHUNKS_PER_QUERY  || '5');

// ─── Store embedding for a chunk ──────────────────────────────────────────────
export async function storeChunkEmbedding(
  chunkId: string,
  embedding: number[]
): Promise<void> {
  // pgvector expects the vector as a string like '[0.1,0.2,...]'
  const vectorStr = `[${embedding.join(',')}]`;

  await query(
    `UPDATE document_chunks SET embedding = $1::vector WHERE id = $2`,
    [vectorStr, chunkId]
  );
}

// ─── CORE: Retrieve similar chunks — ALWAYS filtered by tenantId ──────────────
export async function retrieveSimilarChunks(
  tenantId: string,
  queryText: string,
  maxChunks = MAX_CHUNKS,
  similarityThreshold = SIMILARITY_THRESHOLD
): Promise<RetrievedChunk[]> {

  // 1. Embed the query
  const queryEmbedding = await generateEmbedding(queryText);
  const vectorStr      = `[${queryEmbedding.join(',')}]`;

  // 2. Vector similarity search — tenant_id filter is MANDATORY
  //    Using 1 - cosine_distance = cosine_similarity
  const rows = await query<{
    id: string;
    document_id: string;
    original_name: string;
    content: string;
    chunk_index: number;
    similarity: number;
    metadata: Record<string, unknown>;
    tenant_id: string;
  }>(
    `
    SELECT
      dc.id,
      dc.document_id,
      d.original_name,
      dc.content,
      dc.chunk_index,
      dc.metadata,
      dc.tenant_id,
      1 - (dc.embedding <=> $1::vector) AS similarity
    FROM document_chunks dc
    JOIN documents d ON d.id = dc.document_id
    WHERE
      dc.tenant_id = $2                            -- MANDATORY TENANT ISOLATION
      AND dc.embedding IS NOT NULL
      AND 1 - (dc.embedding <=> $1::vector) >= $3  -- similarity threshold
      AND d.status = 'ready'
    ORDER BY similarity DESC
    LIMIT $4
    `,
    [vectorStr, tenantId, similarityThreshold, maxChunks]
  );

  // 3. Double-check tenant isolation (defense in depth)
  const safeRows = rows.filter((r) => {
    if (r.tenant_id !== tenantId) {
      logger.error('SECURITY: Cross-tenant chunk detected and blocked!', {
        chunkTenant: r.tenant_id,
        requestTenant: tenantId,
      });
      return false;
    }
    return true;
  });

  logger.debug(`Retrieved ${safeRows.length} chunks for tenant`, {
    tenantId,
    threshold: similarityThreshold,
  });

  return safeRows.map((r) => ({
    id:            r.id,
    documentId:    r.document_id,
    documentName:  r.original_name,
    content:       r.content,
    chunkIndex:    r.chunk_index,
    similarity:    parseFloat(String(r.similarity)),
    metadata:      r.metadata,
  }));
}

// ─── Hybrid search (vector + keyword BM25-like) ───────────────────────────────
export async function hybridSearch(
  tenantId: string,
  queryText: string,
  maxChunks = MAX_CHUNKS
): Promise<RetrievedChunk[]> {

  const queryEmbedding = await generateEmbedding(queryText);
  const vectorStr      = `[${queryEmbedding.join(',')}]`;

  // Combine semantic similarity + full-text search rank
  const rows = await query<{
    id: string;
    document_id: string;
    original_name: string;
    content: string;
    chunk_index: number;
    similarity: number;
    metadata: Record<string, unknown>;
    tenant_id: string;
  }>(
    `
    WITH vector_results AS (
      SELECT
        dc.id,
        dc.document_id,
        d.original_name,
        dc.content,
        dc.chunk_index,
        dc.metadata,
        dc.tenant_id,
        1 - (dc.embedding <=> $1::vector) AS vector_score,
        ts_rank(to_tsvector('english', dc.content),
                plainto_tsquery('english', $3)) AS text_score
      FROM document_chunks dc
      JOIN documents d ON d.id = dc.document_id
      WHERE
        dc.tenant_id = $2
        AND dc.embedding IS NOT NULL
        AND d.status = 'ready'
    )
    SELECT
      id, document_id, original_name, content, chunk_index, metadata, tenant_id,
      (0.7 * vector_score + 0.3 * COALESCE(text_score, 0)) AS similarity
    FROM vector_results
    WHERE vector_score >= $4
    ORDER BY similarity DESC
    LIMIT $5
    `,
    [vectorStr, tenantId, queryText, SIMILARITY_THRESHOLD, maxChunks]
  );

  return rows
    .filter((r) => r.tenant_id === tenantId)
    .map((r) => ({
      id:           r.id,
      documentId:   r.document_id,
      documentName: r.original_name,
      content:      r.content,
      chunkIndex:   r.chunk_index,
      similarity:   parseFloat(String(r.similarity)),
      metadata:     r.metadata,
    }));
}
