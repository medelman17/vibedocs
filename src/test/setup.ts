// src/test/setup.ts
import { PGlite } from "@electric-sql/pglite"
import { drizzle } from "drizzle-orm/pglite"
import { sql } from "drizzle-orm"
import { beforeEach, afterEach, afterAll, vi } from "vitest"
import * as schema from "@/db/schema"

// Create in-memory PGlite instance
const client = new PGlite()
export const testDb = drizzle(client, { schema })

// Mock the db module
vi.mock("@/db/client", () => ({
  db: testDb,
}))

// Schema creation SQL (simplified for testing)
const createSchema = async () => {
  // PGlite supports gen_random_uuid() natively in PostgreSQL 13+ core
  // No extension needed

  // Create tables in order (respecting foreign keys)
  await testDb.execute(sql`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT,
      email TEXT UNIQUE NOT NULL,
      email_verified TIMESTAMPTZ,
      image TEXT,
      password_hash TEXT,
      failed_login_attempts INTEGER NOT NULL DEFAULT 0,
      locked_until TIMESTAMPTZ,
      last_login_at TIMESTAMPTZ,
      last_login_ip TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `)

  await testDb.execute(sql`
    CREATE TABLE IF NOT EXISTS organizations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      plan TEXT NOT NULL DEFAULT 'free',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      deleted_at TIMESTAMPTZ
    )
  `)

  await testDb.execute(sql`
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
    )
  `)

  await testDb.execute(sql`
    CREATE TABLE IF NOT EXISTS sessions (
      session_token TEXT PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires TIMESTAMPTZ NOT NULL,
      active_organization_id UUID
    )
  `)

  await testDb.execute(sql`
    CREATE TABLE IF NOT EXISTS accounts (
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      provider TEXT NOT NULL,
      provider_account_id TEXT NOT NULL,
      refresh_token TEXT,
      access_token TEXT,
      expires_at INTEGER,
      token_type TEXT,
      scope TEXT,
      id_token TEXT,
      session_state TEXT,
      PRIMARY KEY(provider, provider_account_id)
    )
  `)

  await testDb.execute(sql`
    CREATE TABLE IF NOT EXISTS verification_tokens (
      identifier TEXT NOT NULL,
      token TEXT NOT NULL,
      expires TIMESTAMPTZ NOT NULL,
      PRIMARY KEY(identifier, token)
    )
  `)

  await testDb.execute(sql`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token TEXT NOT NULL UNIQUE,
      expires_at TIMESTAMPTZ NOT NULL,
      used_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `)

  await testDb.execute(sql`
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
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `)
}

beforeEach(async () => {
  await createSchema()
})

afterEach(async () => {
  // Clean up tables in reverse order
  await testDb.execute(sql`DROP SCHEMA IF EXISTS public CASCADE`)
  await testDb.execute(sql`CREATE SCHEMA public`)
})

afterAll(async () => {
  await client.close()
})
