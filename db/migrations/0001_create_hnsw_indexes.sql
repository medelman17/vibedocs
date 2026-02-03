-- HNSW Vector Indexes for Similarity Search
--
-- IMPORTANT: Run this AFTER bulk data load for optimal index build performance.
-- HNSW indexes are expensive to build incrementally during inserts.
--
-- Prerequisites:
--   1. pgvector extension must be enabled: CREATE EXTENSION IF NOT EXISTS vector;
--   2. Tables must exist (run pnpm db:push first)
--   3. Bulk data should be loaded before running this script
--
-- Usage:
--   psql $DATABASE_URL -f src/db/migrations/0001_create_hnsw_indexes.sql

-- Document chunks vector index (tenant data)
-- Used for finding similar chunks within user-uploaded documents
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_chunks_hnsw
ON document_chunks
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- Reference embeddings vector index (shared data)
-- Used for finding similar clauses in CUAD/ContractNLI/templates
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ref_embed_hnsw
ON reference_embeddings
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- Verify indexes were created
SELECT
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes
WHERE indexname LIKE '%hnsw%';
