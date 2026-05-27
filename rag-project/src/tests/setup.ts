import dotenv from 'dotenv';
dotenv.config({ path: '.env.example' });

// Override for testing
process.env.NODE_ENV          = 'test';
process.env.JWT_SECRET        = 'test-secret-key-32-chars-minimum!!';
process.env.OPENAI_API_KEY    = 'sk-test-key';
process.env.SIMILARITY_THRESHOLD = '0.5';
