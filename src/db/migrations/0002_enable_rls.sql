-- Row-Level Security (RLS) Policies for Tenant Isolation
--
-- Defense-in-depth: These policies provide database-level tenant isolation
-- as a backup to application-layer WHERE clause enforcement.
--
-- Prerequisites:
--   1. Tables must exist (run pnpm db:push first)
--   2. Application must set session variable before queries:
--      SET app.tenant_id = 'uuid-here';
--
-- Usage:
--   psql $DATABASE_URL -f src/db/migrations/0002_enable_rls.sql

-- Enable RLS on all tenant-scoped tables
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE clause_extractions ENABLE ROW LEVEL SECURITY;
ALTER TABLE comparisons ENABLE ROW LEVEL SECURITY;
ALTER TABLE generated_ndas ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Create tenant isolation policies
-- Pattern: Only allow access to rows where tenant_id matches session variable

CREATE POLICY tenant_isolation_documents ON documents
    USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY tenant_isolation_document_chunks ON document_chunks
    USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY tenant_isolation_analyses ON analyses
    USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY tenant_isolation_clause_extractions ON clause_extractions
    USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY tenant_isolation_comparisons ON comparisons
    USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY tenant_isolation_generated_ndas ON generated_ndas
    USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY tenant_isolation_audit_logs ON audit_logs
    USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- Verify RLS is enabled
SELECT
    schemaname,
    tablename,
    rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
AND tablename IN (
    'documents',
    'document_chunks',
    'analyses',
    'clause_extractions',
    'comparisons',
    'generated_ndas',
    'audit_logs'
);

-- List all policies
SELECT
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual
FROM pg_policies
WHERE schemaname = 'public';
