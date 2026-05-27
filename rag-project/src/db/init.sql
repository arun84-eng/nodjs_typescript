-- ─── Extensions ──────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── Tenants Table ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tenants (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          VARCHAR(255) NOT NULL,
  email         VARCHAR(255) UNIQUE NOT NULL,
  api_key       VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  is_active     BOOLEAN DEFAULT TRUE,
  metadata      JSONB DEFAULT '{}',
  created_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ─── Documents Table ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS documents (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  original_name VARCHAR(500) NOT NULL,
  mime_type     VARCHAR(100),
  size_bytes    INTEGER DEFAULT 0,
  status        VARCHAR(50) DEFAULT 'processing'
                CHECK (status IN ('processing', 'ready', 'failed')),
  chunk_count   INTEGER DEFAULT 0,
  error_message TEXT,
  metadata      JSONB DEFAULT '{}',
  created_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ─── Document Chunks Table ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS document_chunks (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id   UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  content       TEXT NOT NULL,
  chunk_index   INTEGER NOT NULL,
  token_count   INTEGER DEFAULT 0,
  embedding     vector(1536),
  metadata      JSONB DEFAULT '{}',
  created_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ─── Query Logs Table (for auditing) ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS query_logs (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  query_text        TEXT NOT NULL,
  answer_text       TEXT,
  confidence        FLOAT,
  guardrail_triggered BOOLEAN DEFAULT FALSE,
  guardrail_reason  TEXT,
  chunks_retrieved  INTEGER DEFAULT 0,
  latency_ms        INTEGER,
  created_at        TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ─── Indexes ──────────────────────────────────────────────────────────────────
-- Vector similarity search index (IVFFlat for cosine similarity)
CREATE INDEX IF NOT EXISTS idx_chunks_embedding
  ON document_chunks USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- Tenant isolation indexes
CREATE INDEX IF NOT EXISTS idx_chunks_tenant_id    ON document_chunks (tenant_id);
CREATE INDEX IF NOT EXISTS idx_chunks_document_id  ON document_chunks (document_id);
CREATE INDEX IF NOT EXISTS idx_documents_tenant_id ON documents (tenant_id);
CREATE INDEX IF NOT EXISTS idx_documents_status    ON documents (status);
CREATE INDEX IF NOT EXISTS idx_query_logs_tenant   ON query_logs (tenant_id);
CREATE INDEX IF NOT EXISTS idx_query_logs_created  ON query_logs (created_at);

-- ─── Updated-At Trigger ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_tenants_updated_at
  BEFORE UPDATE ON tenants
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_documents_updated_at
  BEFORE UPDATE ON documents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
