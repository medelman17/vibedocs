// test/setup.ts
// Optimized test setup with transaction rollback pattern for faster tests
import { PGlite } from "@electric-sql/pglite"
import { drizzle } from "drizzle-orm/pglite"
import { sql } from "drizzle-orm"
import { beforeAll, beforeEach, afterEach, afterAll, vi } from "vitest"
import * as schema from "@/db/schema"

// Mock server-only package (used by lib/dal.ts)
// This allows tests to import modules that use "server-only"
vi.mock("server-only", () => ({}))

// Mock bcryptjs with lower cost factor for faster tests
// bcrypt with cost 12 takes ~2s, cost 4 takes ~10ms
vi.mock("bcryptjs", async () => {
  const actual = await vi.importActual<typeof import("bcryptjs")>("bcryptjs")
  return {
    ...actual,
    hash: (password: string) => actual.hash(password, 4),
  }
})

// Create in-memory PGlite instance
const client = new PGlite()
export const testDb = drizzle(client, { schema })

// Mock the db module
vi.mock("@/db/client", () => ({
  db: testDb,
}))

// Track transaction state
let inTransaction = false

// Schema version - increment when schema changes to force recreation
const SCHEMA_VERSION = 5 // v5: added progress_message to analyses, chunk_classifications table, conversations/messages tables

// Track if schema has been created (survives across test files in same worker)
// Using globalThis to persist across module re-evaluations
declare global {

  var __testSchemaVersion: number | undefined
}

// Batched schema creation SQL - single statement for performance
// All 18 tables created in one execute call
const SCHEMA_SQL = `
  -- Auth tables
  CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT,
    email TEXT UNIQUE NOT NULL,
    "emailVerified" TIMESTAMPTZ,
    image TEXT,
    password_hash TEXT,
    failed_login_attempts INTEGER NOT NULL DEFAULT 0,
    locked_until TIMESTAMPTZ,
    last_login_at TIMESTAMPTZ,
    last_login_ip TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    plan TEXT NOT NULL DEFAULT 'free',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ
  );

  CREATE TABLE IF NOT EXISTS organization_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'member',
    invited_by UUID REFERENCES users(id),
    invited_at TIMESTAMPTZ,
    accepted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(organization_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS sessions (
    "sessionToken" TEXT PRIMARY KEY,
    "userId" UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires TIMESTAMPTZ NOT NULL,
    "activeOrganizationId" UUID
  );

  CREATE TABLE IF NOT EXISTS accounts (
    "userId" UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    provider TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    refresh_token TEXT,
    access_token TEXT,
    expires_at INTEGER,
    token_type TEXT,
    scope TEXT,
    id_token TEXT,
    session_state TEXT,
    PRIMARY KEY(provider, "providerAccountId")
  );

  CREATE TABLE IF NOT EXISTS verification_tokens (
    identifier TEXT NOT NULL,
    token TEXT NOT NULL,
    expires TIMESTAMPTZ NOT NULL,
    PRIMARY KEY(identifier, token)
  );

  CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  -- Document tables
  CREATE TABLE IF NOT EXISTS documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    uploaded_by UUID REFERENCES users(id),
    title TEXT NOT NULL,
    file_name TEXT NOT NULL,
    file_type TEXT NOT NULL,
    file_size INTEGER,
    file_url TEXT,
    content_hash TEXT,
    raw_text TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    error_message TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ
  );

  CREATE TABLE IF NOT EXISTS document_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    chunk_index INTEGER NOT NULL,
    content TEXT NOT NULL,
    section_path TEXT[],
    embedding TEXT,
    token_count INTEGER,
    start_position INTEGER,
    end_position INTEGER,
    chunk_type TEXT,
    analysis_id UUID,
    overlap_tokens INTEGER DEFAULT 0,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(document_id, analysis_id, chunk_index)
  );

  -- Analysis tables
  CREATE TABLE IF NOT EXISTS analyses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending',
    overall_risk_score REAL,
    overall_risk_level TEXT,
    summary TEXT,
    gap_analysis JSONB,
    token_usage JSONB,
    estimated_tokens INTEGER,
    actual_tokens INTEGER,
    estimated_cost REAL,
    was_truncated BOOLEAN DEFAULT false,
    processing_time_ms INTEGER,
    inngest_run_id TEXT,
    progress_stage TEXT,
    progress_percent INTEGER DEFAULT 0,
    progress_message TEXT,
    chunk_map JSONB,
    chunk_stats JSONB,
    metadata JSONB DEFAULT '{}',
    ocr_text TEXT,
    ocr_confidence REAL,
    ocr_warning TEXT,
    ocr_completed_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS clause_extractions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    analysis_id UUID NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    chunk_id UUID REFERENCES document_chunks(id),
    category TEXT NOT NULL,
    secondary_categories TEXT[],
    clause_text TEXT NOT NULL,
    start_position INTEGER,
    end_position INTEGER,
    confidence REAL NOT NULL,
    risk_level TEXT NOT NULL,
    risk_explanation TEXT,
    evidence JSONB,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  -- Comparison and generation tables
  CREATE TABLE IF NOT EXISTS comparisons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    document_a_id UUID NOT NULL REFERENCES documents(id),
    document_b_id UUID NOT NULL REFERENCES documents(id),
    status TEXT NOT NULL DEFAULT 'pending',
    summary TEXT,
    clause_alignments JSONB,
    key_differences JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS generated_ndas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    created_by UUID REFERENCES users(id),
    title TEXT NOT NULL,
    template_source TEXT NOT NULL,
    parameters JSONB NOT NULL,
    content TEXT NOT NULL,
    content_html TEXT,
    status TEXT NOT NULL DEFAULT 'draft',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  -- Audit and reference tables
  CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    table_name TEXT NOT NULL,
    record_id UUID NOT NULL,
    action TEXT NOT NULL,
    old_values JSONB,
    new_values JSONB,
    user_id UUID,
    ip_address TEXT,
    performed_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS reference_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source TEXT NOT NULL,
    source_id TEXT,
    title TEXT NOT NULL,
    raw_text TEXT,
    metadata JSONB DEFAULT '{}',
    content_hash TEXT UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS reference_embeddings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES reference_documents(id) ON DELETE CASCADE,
    parent_id UUID,
    granularity TEXT NOT NULL,
    content TEXT NOT NULL,
    section_path TEXT[],
    category TEXT,
    hypothesis_id INTEGER,
    nli_label TEXT,
    embedding TEXT NOT NULL,
    metadata JSONB DEFAULT '{}',
    content_hash TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS cuad_categories (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    risk_weight REAL DEFAULT 1.0,
    is_nda_relevant BOOLEAN DEFAULT true
  );

  CREATE TABLE IF NOT EXISTS contract_nli_hypotheses (
    id INTEGER PRIMARY KEY,
    text TEXT NOT NULL,
    category TEXT
  );

  CREATE TABLE IF NOT EXISTS chunk_classifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    analysis_id UUID NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
    chunk_id UUID NOT NULL REFERENCES document_chunks(id) ON DELETE CASCADE,
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    category TEXT NOT NULL,
    confidence REAL NOT NULL,
    is_primary BOOLEAN NOT NULL DEFAULT true,
    rationale TEXT,
    chunk_index INTEGER NOT NULL,
    start_position INTEGER,
    end_position INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(analysis_id, chunk_id, category)
  );

  -- Chat tables
  CREATE TABLE IF NOT EXISTS conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    last_message_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ
  );

  CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    attachments JSONB,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ
  );

  CREATE TABLE IF NOT EXISTS bootstrap_progress (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source TEXT NOT NULL,
    status TEXT NOT NULL,
    total_records INTEGER,
    processed_records INTEGER NOT NULL DEFAULT 0,
    embedded_records INTEGER NOT NULL DEFAULT 0,
    error_count INTEGER NOT NULL DEFAULT 0,
    last_processed_hash TEXT,
    last_batch_index INTEGER NOT NULL DEFAULT 0,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
`

// Create schema once globally (not per test or per file)
// Use schema version to detect when schema needs recreation
beforeAll(async () => {
  if (globalThis.__testSchemaVersion !== SCHEMA_VERSION) {
    // Schema version changed or first run - recreate schema
    // Drop and recreate to ensure clean state with new columns
    await client.exec(`
      DROP TABLE IF EXISTS bootstrap_progress CASCADE;
      DROP TABLE IF EXISTS messages CASCADE;
      DROP TABLE IF EXISTS conversations CASCADE;
      DROP TABLE IF EXISTS chunk_classifications CASCADE;
      DROP TABLE IF EXISTS contract_nli_hypotheses CASCADE;
      DROP TABLE IF EXISTS cuad_categories CASCADE;
      DROP TABLE IF EXISTS reference_embeddings CASCADE;
      DROP TABLE IF EXISTS reference_documents CASCADE;
      DROP TABLE IF EXISTS audit_logs CASCADE;
      DROP TABLE IF EXISTS generated_ndas CASCADE;
      DROP TABLE IF EXISTS comparisons CASCADE;
      DROP TABLE IF EXISTS clause_extractions CASCADE;
      DROP TABLE IF EXISTS analyses CASCADE;
      DROP TABLE IF EXISTS document_chunks CASCADE;
      DROP TABLE IF EXISTS documents CASCADE;
      DROP TABLE IF EXISTS password_reset_tokens CASCADE;
      DROP TABLE IF EXISTS verification_tokens CASCADE;
      DROP TABLE IF EXISTS accounts CASCADE;
      DROP TABLE IF EXISTS sessions CASCADE;
      DROP TABLE IF EXISTS organization_members CASCADE;
      DROP TABLE IF EXISTS organizations CASCADE;
      DROP TABLE IF EXISTS users CASCADE;
    `)
    await client.exec(SCHEMA_SQL)
    globalThis.__testSchemaVersion = SCHEMA_VERSION
  }
})

// Use transaction rollback pattern for fast test isolation
// ~10x faster than DROP/CREATE schema
beforeEach(async () => {
  await testDb.execute(sql`BEGIN`)
  inTransaction = true
})

afterEach(async () => {
  if (inTransaction) {
    await testDb.execute(sql`ROLLBACK`)
    inTransaction = false
  }
})

// Clean up transaction state after each file
// Note: We don't close the client here as it's shared across all test files
afterAll(async () => {
  // Ensure we're not in a transaction before next file starts
  if (inTransaction) {
    await testDb.execute(sql`ROLLBACK`)
    inTransaction = false
  }
  // Client cleanup happens automatically when the process exits
})
