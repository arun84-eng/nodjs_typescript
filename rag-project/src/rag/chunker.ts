import { logger } from '../utils/logger';

export interface TextChunk {
  content: string;
  index: number;
  startChar: number;
  endChar: number;
  tokenCount: number;
}

const CHUNK_SIZE    = parseInt(process.env.CHUNK_SIZE    || '500');
const CHUNK_OVERLAP = parseInt(process.env.CHUNK_OVERLAP || '50');

// ─── Simple token estimator (≈ 4 chars per token) ─────────────────────────────
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// ─── Split text into sentences using regex ─────────────────────────────────────
function splitIntoSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+(?=[A-Z])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 10);
}

// ─── Main chunking function ────────────────────────────────────────────────────
export function chunkText(
  text: string,
  chunkSize  = CHUNK_SIZE,
  overlap    = CHUNK_OVERLAP
): TextChunk[] {
  if (!text || text.trim().length === 0) return [];

  const cleanText   = text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  const sentences   = splitIntoSentences(cleanText);
  const chunks: TextChunk[] = [];

  let currentChunk    = '';
  let currentTokens   = 0;
  let chunkIndex      = 0;
  let charPosition    = 0;
  let overlapBuffer   = '';

  for (const sentence of sentences) {
    const sentenceTokens = estimateTokens(sentence);

    // If adding this sentence would exceed chunk size → save current chunk
    if (currentTokens + sentenceTokens > chunkSize && currentChunk.length > 0) {
      const startChar = charPosition - currentChunk.length;

      chunks.push({
        content:    currentChunk.trim(),
        index:      chunkIndex++,
        startChar,
        endChar:    charPosition,
        tokenCount: currentTokens,
      });

      // Carry over overlap sentences to next chunk
      const words          = currentChunk.split(' ');
      const overlapWords   = words.slice(-overlap);
      overlapBuffer        = overlapWords.join(' ');
      currentChunk         = overlapBuffer + ' ' + sentence;
      currentTokens        = estimateTokens(currentChunk);
    } else {
      currentChunk  = currentChunk ? currentChunk + ' ' + sentence : sentence;
      currentTokens += sentenceTokens;
    }

    charPosition += sentence.length + 1;
  }

  // Push final chunk
  if (currentChunk.trim().length > 0) {
    chunks.push({
      content:    currentChunk.trim(),
      index:      chunkIndex,
      startChar:  charPosition - currentChunk.length,
      endChar:    charPosition,
      tokenCount: currentTokens,
    });
  }

  logger.debug(`Chunked text into ${chunks.length} chunks`, {
    totalChars: cleanText.length,
    avgChunkSize: chunks.reduce((s, c) => s + c.tokenCount, 0) / (chunks.length || 1),
  });

  return chunks;
}

// ─── Extract text from PDF buffer ─────────────────────────────────────────────
export async function extractTextFromBuffer(
  buffer: Buffer,
  mimeType: string
): Promise<string> {
  if (mimeType === 'application/pdf') {
    try {
      const pdfParse = await import('pdf-parse');
      const data = await pdfParse.default(buffer);
      return data.text || '';
    } catch (err) {
      logger.error('PDF text extraction failed', { error: (err as Error).message });
      throw new Error(`PDF extraction failed: ${(err as Error).message}`);
    }
  }

  if (mimeType.startsWith('text/')) {
    return buffer.toString('utf-8');
  }

  throw new Error(`Unsupported file type: ${mimeType}`);
}
