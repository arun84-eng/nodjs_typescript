// ─── Tenant ──────────────────────────────────────────────────────────────────
export interface Tenant {
  id: string;
  name: string;
  email: string;
  apiKey: string;
  passwordHash: string;
  isActive: boolean;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateTenantDTO {
  name: string;
  email: string;
  password: string;
  metadata?: Record<string, unknown>;
}

export interface TenantPublic {
  id: string;
  name: string;
  email: string;
  apiKey: string;
  isActive: boolean;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

// ─── Document ────────────────────────────────────────────────────────────────
export interface Document {
  id: string;
  tenantId: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  status: 'processing' | 'ready' | 'failed';
  chunkCount: number;
  errorMessage?: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface DocumentChunk {
  id: string;
  documentId: string;
  tenantId: string;
  content: string;
  chunkIndex: number;
  tokenCount: number;
  embedding?: number[];
  metadata: Record<string, unknown>;
  createdAt: Date;
}

// ─── RAG / Query ─────────────────────────────────────────────────────────────
export interface QueryRequest {
  question: string;
  maxSources?: number;
}

export interface SourceDocument {
  documentId: string;
  documentName: string;
  content: string;
  similarity: number;
  chunkIndex: number;
}

export interface QueryResult {
  answer: string;
  sources: SourceDocument[];
  confidence: number;
  guardrailTriggered: boolean;
  guardrailReason?: string;
  latencyMs: number;
}

export interface RetrievedChunk {
  id: string;
  documentId: string;
  documentName: string;
  content: string;
  chunkIndex: number;
  similarity: number;
  metadata: Record<string, unknown>;
}

// ─── Auth ────────────────────────────────────────────────────────────────────
export interface JwtPayload {
  tenantId: string;
  email: string;
  iat?: number;
  exp?: number;
}

export interface AuthRequest extends Request {
  tenant?: Tenant;
  tenantId?: string;
}

// ─── API Responses ────────────────────────────────────────────────────────────
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  timestamp: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

// ─── Guardrail ────────────────────────────────────────────────────────────────
export interface GuardrailResult {
  blocked: boolean;
  reason?: GuardrailReason;
  sanitizedInput?: string;
}

export type GuardrailReason =
  | 'prompt_injection'
  | 'cross_tenant_attempt'
  | 'out_of_scope'
  | 'low_confidence'
  | 'content_policy';
