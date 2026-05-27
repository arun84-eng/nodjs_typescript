import { v4 as uuidv4 } from 'uuid';
import { query, withTransaction } from '../db/pool';
import { extractTextFromBuffer, chunkText } from '../rag/chunker';
import { generateEmbeddingsBatch } from '../rag/embeddings';
import { Document } from '../models/types';
import { AppError } from '../middleware/errorHandler';
import { cacheDelete } from './cacheService';
import { logger } from '../utils/logger';

// ─── Map DB row → Document ────────────────────────────────────────────────────
function rowToDocument(row: Record<string, unknown>): Document {
  return {
    id:           row.id as string,
    tenantId:     row.tenant_id as string,
    originalName: row.original_name as string,
    mimeType:     row.mime_type as string,
    sizeBytes:    row.size_bytes as number,
    status:       row.status as Document['status'],
    chunkCount:   row.chunk_count as number,
    errorMessage: row.error_message as string | undefined,
    metadata:     (row.metadata as Record<string, unknown>) || {},
    createdAt:    row.created_at as Date,
    updatedAt:    row.updated_at as Date,
  };
}

// ─── Upload and process a document ───────────────────────────────────────────
export async function uploadDocument(
  tenantId:     string,
  file:         Express.Multer.File,
  extraMetadata?: Record<string, unknown>
): Promise<Document> {

  // 1. Create document record (status: processing)
  const rows = await query<Record<string, unknown>>(
    `INSERT INTO documents (tenant_id, original_name, mime_type, size_bytes, status, metadata)
     VALUES ($1, $2, $3, $4, 'processing', $5)
     RETURNING *`,
    [
      tenantId,
      file.originalname,
      file.mimetype,
      file.size,
      JSON.stringify({ ...extraMetadata, uploadedAt: new Date().toISOString() }),
    ]
  );

  const doc = rowToDocument(rows[0]);

  // 2. Process asynchronously (don't block the response)
  processDocument(tenantId, doc.id, file).catch((err) => {
    logger.error('Document processing failed', {
      documentId: doc.id,
      tenantId,
      error: (err as Error).message,
    });
  });

  logger.info('Document upload initiated', {
    documentId: doc.id,
    tenantId,
    filename: file.originalname,
  });

  return doc;
}

// ─── Background processing pipeline ──────────────────────────────────────────
async function processDocument(
  tenantId:   string,
  documentId: string,
  file:       Express.Multer.File
): Promise<void> {
  try {
    // Step 1: Extract text
    logger.debug('Extracting text', { documentId });
    const text = await extractTextFromBuffer(file.buffer, file.mimetype);

    if (!text || text.trim().length < 20) {
      throw new Error('Document appears to be empty or unreadable');
    }

    // Step 2: Chunk text
    logger.debug('Chunking text', { documentId, textLength: text.length });
    const chunks = chunkText(text);

    if (chunks.length === 0) {
      throw new Error('No chunks generated from document');
    }

    // Step 3: Generate embeddings in batch
    logger.debug('Generating embeddings', { documentId, chunks: chunks.length });
    const embeddings = await generateEmbeddingsBatch(chunks.map((c) => c.content));

    // Step 4: Store chunks + embeddings in transaction
    await withTransaction(async (client) => {
      for (let i = 0; i < chunks.length; i++) {
        const chunk     = chunks[i];
        const embedding = embeddings[i];
        const vectorStr = `[${embedding.join(',')}]`;

        await client.query(
          `INSERT INTO document_chunks
             (document_id, tenant_id, content, chunk_index, token_count, embedding, metadata)
           VALUES ($1, $2, $3, $4, $5, $6::vector, $7)`,
          [
            documentId,
            tenantId,
            chunk.content,
            chunk.index,
            chunk.tokenCount,
            vectorStr,
            JSON.stringify({ startChar: chunk.startChar, endChar: chunk.endChar }),
          ]
        );
      }

      // Mark document as ready
      await client.query(
        `UPDATE documents
         SET status = 'ready', chunk_count = $1, updated_at = NOW()
         WHERE id = $2`,
        [chunks.length, documentId]
      );
    });

    logger.info('Document processing complete', {
      documentId,
      tenantId,
      chunks: chunks.length,
    });

    // Invalidate cache
    await cacheDelete(`docs:${tenantId}:*`);

  } catch (err) {
    const message = (err as Error).message;
    await query(
      `UPDATE documents SET status = 'failed', error_message = $1, updated_at = NOW() WHERE id = $2`,
      [message, documentId]
    );
    logger.error('Document pipeline failed', { documentId, tenantId, error: message });
    throw err;
  }
}

// ─── List documents for a tenant ─────────────────────────────────────────────
export async function listDocuments(
  tenantId: string,
  page     = 1,
  limit    = 20
): Promise<{ documents: Document[]; total: number }> {
  const offset = (page - 1) * limit;

  const [docsRows, countRows] = await Promise.all([
    query<Record<string, unknown>>(
      `SELECT * FROM documents
       WHERE tenant_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [tenantId, limit, offset]
    ),
    query<{ count: string }>(
      'SELECT COUNT(*)::int AS count FROM documents WHERE tenant_id = $1',
      [tenantId]
    ),
  ]);

  return {
    documents: docsRows.map(rowToDocument),
    total:     parseInt(countRows[0]?.count || '0'),
  };
}

// ─── Get single document ──────────────────────────────────────────────────────
export async function getDocument(
  tenantId:   string,
  documentId: string
): Promise<Document> {
  const rows = await query<Record<string, unknown>>(
    'SELECT * FROM documents WHERE id = $1 AND tenant_id = $2',
    [documentId, tenantId]
  );

  if (rows.length === 0) {
    throw new AppError(404, 'Document not found');
  }

  return rowToDocument(rows[0]);
}

// ─── Delete document and its chunks ──────────────────────────────────────────
export async function deleteDocument(
  tenantId:   string,
  documentId: string
): Promise<void> {
  const rows = await query(
    'SELECT id FROM documents WHERE id = $1 AND tenant_id = $2',
    [documentId, tenantId]
  );

  if (rows.length === 0) {
    throw new AppError(404, 'Document not found');
  }

  // Cascade deletes chunks too (FK ON DELETE CASCADE)
  await query('DELETE FROM documents WHERE id = $1 AND tenant_id = $2', [
    documentId,
    tenantId,
  ]);

  await cacheDelete(`docs:${tenantId}:*`);
  logger.info('Document deleted', { documentId, tenantId });
}
