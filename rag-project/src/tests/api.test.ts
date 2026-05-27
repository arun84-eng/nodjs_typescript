import request from 'supertest';
import app from '../app';

// ─── Mock DB and external services ────────────────────────────────────────────
jest.mock('../db/pool', () => ({
  query:           jest.fn(),
  withTransaction: jest.fn(),
  checkDatabaseConnection: jest.fn().mockResolvedValue(true),
  closePool:       jest.fn(),
}));

jest.mock('../services/cacheService', () => ({
  cacheGet:      jest.fn().mockResolvedValue(null),
  cacheSet:      jest.fn(),
  cacheDelete:   jest.fn(),
  getRedisClient: jest.fn().mockResolvedValue(null),
  closeRedis:    jest.fn(),
}));

jest.mock('../rag/embeddings', () => ({
  generateEmbedding:       jest.fn().mockResolvedValue(new Array(1536).fill(0.1)),
  generateEmbeddingsBatch: jest.fn().mockResolvedValue([new Array(1536).fill(0.1)]),
}));

const { query } = require('../db/pool');

// ─── Health endpoint ──────────────────────────────────────────────────────────
describe('GET /health', () => {
  test('returns 200 with status info', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status');
    expect(res.body).toHaveProperty('services');
  });
});

// ─── Tenant creation ──────────────────────────────────────────────────────────
describe('POST /tenant', () => {
  beforeEach(() => {
    query.mockImplementation((sql: string) => {
      if (sql.includes('SELECT id FROM tenants WHERE email')) return Promise.resolve([]);
      if (sql.includes('INSERT INTO tenants')) return Promise.resolve([{
        id:           'tenant-uuid-123',
        name:         'Test Corp',
        email:        'test@corp.com',
        api_key:      'rag_abc123',
        password_hash: 'hashed',
        is_active:    true,
        metadata:     {},
        created_at:   new Date(),
        updated_at:   new Date(),
      }]);
      return Promise.resolve([]);
    });
  });

  test('creates tenant with valid data', async () => {
    const res = await request(app).post('/tenant').send({
      name:     'Test Corp',
      email:    'test@corp.com',
      password: 'SecurePass1',
    });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('tenant');
    expect(res.body.data).toHaveProperty('token');
  });

  test('rejects missing email', async () => {
    const res = await request(app).post('/tenant').send({
      name:     'Test Corp',
      password: 'SecurePass1',
    });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test('rejects weak password', async () => {
    const res = await request(app).post('/tenant').send({
      name:     'Test Corp',
      email:    'test@corp.com',
      password: 'weak',
    });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test('rejects invalid email format', async () => {
    const res = await request(app).post('/tenant').send({
      name:     'Test Corp',
      email:    'not-an-email',
      password: 'SecurePass1',
    });
    expect(res.status).toBe(400);
  });
});

// ─── Unknown routes ────────────────────────────────────────────────────────────
describe('404 handler', () => {
  test('returns 404 for unknown routes', async () => {
    const res = await request(app).get('/unknown-route-xyz');
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});

// ─── Auth middleware ───────────────────────────────────────────────────────────
describe('Authentication', () => {
  test('rejects request without Authorization header', async () => {
    const res = await request(app).get('/tenant/some-id');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  test('rejects malformed Bearer token', async () => {
    const res = await request(app)
      .get('/tenant/some-id')
      .set('Authorization', 'Bearer invalid.token.here');
    expect(res.status).toBe(401);
  });
});
