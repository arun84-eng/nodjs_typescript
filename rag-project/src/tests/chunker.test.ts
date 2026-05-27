import { chunkText } from '../rag/chunker';

describe('Text Chunker', () => {
  test('returns empty array for empty text', () => {
    expect(chunkText('')).toHaveLength(0);
    expect(chunkText('   ')).toHaveLength(0);
  });

  test('chunks a simple paragraph', () => {
    const text = 'This is the first sentence. This is the second sentence. This is the third sentence, which is a bit longer and adds more content.';
    const chunks = chunkText(text, 50, 10);
    expect(chunks.length).toBeGreaterThan(0);
  });

  test('each chunk has required fields', () => {
    const text = Array(20).fill('This is a sentence with some content.').join(' ');
    const chunks = chunkText(text);

    for (const chunk of chunks) {
      expect(chunk).toHaveProperty('content');
      expect(chunk).toHaveProperty('index');
      expect(chunk).toHaveProperty('startChar');
      expect(chunk).toHaveProperty('endChar');
      expect(chunk).toHaveProperty('tokenCount');
      expect(chunk.content.length).toBeGreaterThan(0);
    }
  });

  test('chunk indexes are sequential', () => {
    const text = Array(30).fill('A longer sentence with more words to create bigger content.').join(' ');
    const chunks = chunkText(text, 100, 20);

    chunks.forEach((chunk, i) => {
      expect(chunk.index).toBe(i);
    });
  });

  test('respects chunk size limit approximately', () => {
    const text = Array(50).fill('This is a test sentence for chunking purposes.').join(' ');
    const chunkSize = 100;
    const chunks = chunkText(text, chunkSize, 10);

    for (const chunk of chunks) {
      // Allow some overage for sentence integrity
      expect(chunk.tokenCount).toBeLessThan(chunkSize * 2);
    }
  });
});
