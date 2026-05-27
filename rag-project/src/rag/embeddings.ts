import OpenAI from 'openai';
import { logger } from '../utils/logger';

let openaiClient: OpenAI | null = null;

function getClient(): OpenAI {
  if (!openaiClient) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('OPENAI_API_KEY is not set');
    openaiClient = new OpenAI({ apiKey });
  }
  return openaiClient;
}

const EMBEDDING_MODEL = process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-ada-002';
const EMBEDDING_DIMENSIONS = 1536;

// ─── Generate single embedding ────────────────────────────────────────────────
export async function generateEmbedding(text: string): Promise<number[]> {
  const client = getClient();

  // Clean and truncate text
  const cleanText = text.replace(/\n+/g, ' ').trim().slice(0, 8000);

  try {
    const response = await client.embeddings.create({
      model: EMBEDDING_MODEL,
      input: cleanText,
    });
    return response.data[0].embedding;
  } catch (err) {
    logger.error('Embedding generation failed', { error: (err as Error).message });
    throw new Error(`Failed to generate embedding: ${(err as Error).message}`);
  }
}

// ─── Generate batch embeddings (more efficient) ───────────────────────────────
export async function generateEmbeddingsBatch(
  texts: string[],
  batchSize = 20
): Promise<number[][]> {
  const client = getClient();
  const embeddings: number[][] = [];

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts
      .slice(i, i + batchSize)
      .map((t) => t.replace(/\n+/g, ' ').trim().slice(0, 8000));

    try {
      const response = await client.embeddings.create({
        model: EMBEDDING_MODEL,
        input: batch,
      });

      // Preserve order
      const batchEmbeddings = response.data
        .sort((a, b) => a.index - b.index)
        .map((d) => d.embedding);

      embeddings.push(...batchEmbeddings);
      logger.debug(`Generated embeddings for batch ${i / batchSize + 1}`);
    } catch (err) {
      logger.error('Batch embedding failed', { error: (err as Error).message, batch: i });
      throw err;
    }
  }

  return embeddings;
}

export { EMBEDDING_DIMENSIONS };
