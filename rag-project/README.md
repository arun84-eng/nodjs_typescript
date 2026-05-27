# 🧠 Multi-Tenant RAG System

A production-grade **Retrieval-Augmented Generation (RAG)** API built with Node.js + TypeScript. Multiple organizations can upload and query their own knowledge base with **strict tenant isolation** and **multi-layer guardrails**.

---

## 📐 Architecture Overview

```
Client Request
     │
     ▼
┌─────────────────────────────────────────────────────────┐
│                    Express API (Port 3000)               │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────┐ │
│  │ /tenant  │  │/documents│  │  /query  │  │/health │ │
│  └──────────┘  └──────────┘  └──────────┘  └────────┘ │
└────────────────────────┬────────────────────────────────┘
                         │
           ┌─────────────┼──────────────┐
           │             │              │
     ┌─────▼──┐   ┌──────▼─────┐  ┌────▼────┐
     │  Auth  │   │ Guardrails │  │Validation│
     │  JWT   │   │ (5 layers) │  │  (Zod)  │
     └─────┬──┘   └──────┬─────┘  └────┬────┘
           └─────────────┼──────────────┘
                         │
           ┌─────────────┼──────────────┐
           │             │              │
    ┌──────▼──────┐ ┌────▼────┐ ┌──────▼──────┐
    │   Tenant    │ │Document │ │    Query     │
    │   Service   │ │ Service │ │   Service    │
    └─────────────┘ └────┬────┘ └──────┬───────┘
                         │             │
                  ┌───────▼─────────────▼────────┐
                  │          RAG Pipeline         │
                  │  Chunker → Embeddings →       │
                  │  Retriever → Generator        │
                  └──────────────┬───────────────┘
                                 │
              ┌──────────────────┼──────────────────┐
              │                  │                   │
       ┌──────▼──────┐   ┌───────▼──────┐  ┌────────▼──────┐
       │  PostgreSQL  │   │   pgvector   │  │     Redis     │
       │  (metadata)  │   │  (vectors)   │  │   (cache)     │
       └─────────────┘   └──────────────┘  └───────────────┘
                                 │
                         ┌───────▼──────┐
                         │  OpenAI API  │
                         │ Embeddings + │
                         │    Chat      │
                         └──────────────┘
```

### Multi-Tenant Isolation Strategy

Every vector/document is tagged with `tenant_id`. All DB queries have a mandatory `WHERE tenant_id = $X` clause. The retriever adds a **second enforcement layer** by filtering results post-query to ensure no cross-tenant data ever reaches the response.

---

## ✅ Features

| Feature | Status |
|---|---|
| Multi-tenant architecture | ✅ |
| JWT Authentication | ✅ (Bonus) |
| Document upload (PDF, TXT, MD, CSV) | ✅ |
| Text chunking with overlap | ✅ |
| OpenAI Embeddings | ✅ |
| pgvector similarity search | ✅ |
| Hybrid search (vector + BM25) | ✅ (Bonus) |
| Prompt injection protection | ✅ |
| Cross-tenant leakage prevention | ✅ |
| Out-of-scope detection | ✅ |
| Low-confidence fallback | ✅ |
| Streaming responses (SSE) | ✅ (Bonus) |
| Redis caching | ✅ (Bonus) |
| Docker + docker-compose | ✅ (Bonus) |
| Rate limiting | ✅ |
| Query audit logs | ✅ |
| Unit + Integration tests | ✅ (Bonus) |

---

## 🛠️ Tech Stack

- **Runtime**: Node.js 20 + TypeScript 5
- **Framework**: Express 4
- **Database**: PostgreSQL 16 + pgvector
- **LLM/Embeddings**: OpenAI (gpt-3.5-turbo + text-embedding-ada-002)
- **Cache**: Redis 7
- **Auth**: JWT (jsonwebtoken)
- **Validation**: Zod
- **Testing**: Jest + Supertest
- **Containerization**: Docker + docker-compose

---

## 📦 Project Structure

```
src/
├── api/
│   └── routes/
│       ├── tenantRoutes.ts       # Tenant CRUD + login
│       ├── documentRoutes.ts     # Upload, list, delete docs
│       ├── queryRoutes.ts        # RAG query + history
│       └── healthRoutes.ts       # Health check
├── services/
│   ├── tenantService.ts          # Tenant business logic
│   ├── documentService.ts        # Document pipeline orchestration
│   ├── queryService.ts           # RAG query orchestration
│   └── cacheService.ts           # Redis wrapper
├── middleware/
│   ├── auth.ts                   # JWT auth + tenant access check
│   ├── guardrails.ts             # Prompt injection + scope protection
│   ├── validation.ts             # Zod request validation
│   ├── upload.ts                 # Multer file upload config
│   └── errorHandler.ts           # Global error handler
├── rag/
│   ├── embeddings.ts             # OpenAI embedding generation
│   ├── chunker.ts                # Text splitting + PDF extraction
│   ├── retriever.ts              # Vector similarity search (tenant-isolated)
│   └── generator.ts              # LLM answer generation + streaming
├── models/
│   └── types.ts                  # TypeScript interfaces
├── db/
│   ├── pool.ts                   # PostgreSQL connection pool
│   ├── migrate.ts                # Migration runner
│   └── init.sql                  # Schema (pgvector, tables, indexes)
├── utils/
│   └── logger.ts                 # Winston logger
└── tests/
    ├── setup.ts                  # Test environment
    ├── guardrails.test.ts        # Guardrail unit tests
    ├── chunker.test.ts           # Chunker unit tests
    └── api.test.ts               # API integration tests
```

---

## 🚀 Quick Start (Recommended: Docker)

### Prerequisites
- Docker + Docker Compose installed
- OpenAI API key

### Step 1 — Clone and configure

```bash
# Copy environment file
cp .env.example .env

# Edit .env and set your keys:
# OPENAI_API_KEY=sk-your-key-here
# JWT_SECRET=your-32-char-minimum-secret-key
nano .env
```

### Step 2 — Start all services

```bash
docker-compose up -d
```

This starts PostgreSQL (with pgvector), Redis, and the app on port 3000.

### Step 3 — Check health

```bash
curl http://localhost:3000/health
```

---

## 💻 Local Development (Without Docker)

### Prerequisites
- Node.js 20+
- PostgreSQL 14+ with pgvector extension
- Redis (optional)
- OpenAI API key

### Step 1 — Install PostgreSQL pgvector

```bash
# Ubuntu/Debian
sudo apt-get install postgresql-16-pgvector

# macOS with Homebrew
brew install pgvector
```

### Step 2 — Create database

```bash
psql -U postgres
CREATE DATABASE rag_db;
\q
```

### Step 3 — Install dependencies

```bash
cd rag-project
npm install
```

### Step 4 — Configure environment

```bash
cp .env.example .env
# Edit .env with your values (DB credentials, OpenAI key, JWT secret)
```

### Step 5 — Run database migrations

```bash
npm run migrate
```

### Step 6 — Start development server

```bash
npm run dev
```

Server starts at `http://localhost:3000`

---

## 🔌 API Reference

### Authentication

All protected endpoints require:
```
Authorization: Bearer <your-jwt-token>
```

Get a token via `POST /tenant/login`.

---

### Tenant Endpoints

#### Register Tenant
```http
POST /tenant
Content-Type: application/json

{
  "name": "Acme Legal Firm",
  "email": "admin@acme.com",
  "password": "SecurePass1"
}
```
**Response:**
```json
{
  "success": true,
  "data": {
    "tenant": { "id": "...", "name": "Acme Legal Firm", "apiKey": "rag_..." },
    "token": "eyJhbGci..."
  }
}
```

#### Login
```http
POST /tenant/login
Content-Type: application/json

{ "email": "admin@acme.com", "password": "SecurePass1" }
```

#### Get Tenant
```http
GET /tenant/:id
Authorization: Bearer <token>
```

#### Get Stats
```http
GET /tenant/:id/stats
Authorization: Bearer <token>
```

---

### Document Endpoints

#### Upload Document
```http
POST /tenant/:tenantId/documents
Authorization: Bearer <token>
Content-Type: multipart/form-data

file: <PDF, TXT, MD, or CSV file>
```

#### List Documents
```http
GET /tenant/:tenantId/documents?page=1&limit=20
Authorization: Bearer <token>
```

#### Get Document
```http
GET /tenant/:tenantId/documents/:documentId
Authorization: Bearer <token>
```

#### Delete Document
```http
DELETE /tenant/:tenantId/documents/:documentId
Authorization: Bearer <token>
```

---

### Query Endpoint

#### Standard Query
```http
POST /tenant/:tenantId/query
Authorization: Bearer <token>
Content-Type: application/json

{
  "question": "What is the refund policy?",
  "maxSources": 5,
  "useHybridSearch": false
}
```
**Response:**
```json
{
  "success": true,
  "data": {
    "answer": "According to the policy document...",
    "sources": [
      {
        "documentId": "...",
        "documentName": "refund-policy.pdf",
        "content": "Customers may request refunds within 30 days...",
        "similarity": 0.92,
        "chunkIndex": 3
      }
    ],
    "confidence": 0.89,
    "guardrailTriggered": false,
    "latencyMs": 842
  }
}
```

#### Streaming Query (SSE)
```http
POST /tenant/:tenantId/query
Content-Type: application/json

{ "question": "Summarize the employee handbook", "stream": true }
```

---

### Health Check
```http
GET /health
```

---

## 🔒 Guardrails

| Type | What it catches | Response |
|---|---|---|
| **Prompt Injection** | "ignore instructions", "jailbreak", template injection | Safe refusal |
| **Cross-Tenant** | Requests for other orgs' data | Hard block |
| **Out of Scope** | Harmful/unrelated requests | Safe refusal |
| **Low Confidence** | Similarity score < threshold | "Not enough info" |
| **Input Sanitization** | HTML, script tags, template syntax | Stripped automatically |

---

## 🧪 Running Tests

```bash
npm test               # Run all tests
npm test -- --coverage # With coverage report
```

---

## 📈 Performance Notes

- Embeddings are batched (20 at a time) to reduce API calls
- Redis caches query results for 10 minutes
- pgvector IVFFlat index for fast ANN search
- Memory storage for uploads (no temp disk I/O)
- Rate limiting: 100 req/15min globally, 20 queries/min

---

## 🌱 Environment Variables

| Variable | Required | Description |
|---|---|---|
| `OPENAI_API_KEY` | ✅ | Your OpenAI API key |
| `JWT_SECRET` | ✅ | Min 32-char JWT signing secret |
| `DB_HOST` | ✅ | PostgreSQL host |
| `DB_PASSWORD` | ✅ | PostgreSQL password |
| `REDIS_URL` | ❌ | Redis URL (caching optional) |
| `SIMILARITY_THRESHOLD` | ❌ | Min similarity score (default: 0.75) |
| `CHUNK_SIZE` | ❌ | Tokens per chunk (default: 500) |
