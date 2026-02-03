#!/usr/bin/env npx tsx
/**
 * Database Audit Script
 *
 * Tests database connectivity and insertion patterns for reference data.
 *
 * Usage: pnpm tsx scripts/audit-database.ts
 */

import { config } from "dotenv"
config({ path: ".env.local" })

async function main() {
  console.log("🔍 Database Audit\n")

  // Check DATABASE_URL
  if (!process.env.DATABASE_URL) {
    console.error("❌ DATABASE_URL not set in .env.local")
    process.exit(1)
  }
  console.log("✅ DATABASE_URL is set")

  // Import db client
  const { db } = await import("../src/db/client")
  const { referenceDocuments, referenceEmbeddings } = await import(
    "../src/db/schema/reference"
  )
  const { sql } = await import("drizzle-orm")

  // Test connection
  console.log("\nTesting connection...")
  try {
    await db.execute(sql`SELECT 1 as test`)
    console.log("✅ Connection successful")
  } catch (error) {
    console.error("❌ Connection failed:", error)
    process.exit(1)
  }

  // Check if tables exist
  console.log("\nChecking tables...")
  try {
    const docs = await db.execute(sql`
      SELECT COUNT(*) as count FROM reference_documents
    `)
    const embeds = await db.execute(sql`
      SELECT COUNT(*) as count FROM reference_embeddings
    `)
    console.log(`✅ reference_documents: ${(docs as unknown as { count: string }[])[0]?.count ?? 0} rows`)
    console.log(`✅ reference_embeddings: ${(embeds as unknown as { count: string }[])[0]?.count ?? 0} rows`)
  } catch (error) {
    console.error("❌ Table check failed:", error)
    console.log("   Tables might not exist - run pnpm db:push")
    process.exit(1)
  }

  // Test insert with mock data
  console.log("\nTesting insert (mock data)...")
  const testHash = `test-audit-${Date.now()}`
  const mockEmbedding = new Array(1024).fill(0.1)

  try {
    // Insert document
    const [doc] = await db
      .insert(referenceDocuments)
      .values({
        source: "cuad",
        sourceId: `audit:test:${testHash}`,
        title: "Audit Test Document",
        rawText: "This is a test document for auditing the database insertion.",
        metadata: { test: true },
        contentHash: testHash,
      })
      .onConflictDoUpdate({
        target: referenceDocuments.contentHash,
        set: { source: "cuad" },
      })
      .returning({ id: referenceDocuments.id })

    console.log(`✅ Document inserted: ${doc.id}`)

    // Insert embedding
    await db
      .insert(referenceEmbeddings)
      .values({
        documentId: doc.id,
        content: "This is a test document for auditing.",
        embedding: mockEmbedding,
        granularity: "document",
        sectionPath: [],
        contentHash: testHash,
        metadata: { test: true },
      })
      .onConflictDoNothing({ target: referenceEmbeddings.contentHash })

    console.log("✅ Embedding inserted")

    // Clean up test data
    await db.execute(sql`
      DELETE FROM reference_embeddings WHERE content_hash = ${testHash}
    `)
    await db.execute(sql`
      DELETE FROM reference_documents WHERE content_hash = ${testHash}
    `)
    console.log("✅ Test data cleaned up")
  } catch (error) {
    console.error("❌ Insert test failed:", error)
    process.exit(1)
  }

  // Test bulk insert performance
  console.log("\nTesting bulk insert (10 records)...")
  const bulkStart = Date.now()
  const bulkHashes: string[] = []

  try {
    for (let i = 0; i < 10; i++) {
      const hash = `bulk-audit-${Date.now()}-${i}`
      bulkHashes.push(hash)

      const [doc] = await db
        .insert(referenceDocuments)
        .values({
          source: "cuad",
          sourceId: `audit:bulk:${hash}`,
          title: `Bulk Test ${i}`,
          rawText: `Bulk test content ${i}`,
          metadata: { test: true, index: i },
          contentHash: hash,
        })
        .onConflictDoUpdate({
          target: referenceDocuments.contentHash,
          set: { source: "cuad" },
        })
        .returning({ id: referenceDocuments.id })

      await db
        .insert(referenceEmbeddings)
        .values({
          documentId: doc.id,
          content: `Bulk test content ${i}`,
          embedding: mockEmbedding,
          granularity: "document",
          sectionPath: [],
          contentHash: hash,
          metadata: { test: true },
        })
        .onConflictDoNothing({ target: referenceEmbeddings.contentHash })
    }

    const bulkDuration = Date.now() - bulkStart
    console.log(`✅ Bulk insert: 10 records in ${bulkDuration}ms (${bulkDuration / 10}ms per record)`)

    // Clean up
    for (const hash of bulkHashes) {
      await db.execute(sql`DELETE FROM reference_embeddings WHERE content_hash = ${hash}`)
      await db.execute(sql`DELETE FROM reference_documents WHERE content_hash = ${hash}`)
    }
    console.log("✅ Bulk test data cleaned up")
  } catch (error) {
    console.error("❌ Bulk insert failed:", error)
    // Try to clean up
    for (const hash of bulkHashes) {
      try {
        await db.execute(sql`DELETE FROM reference_embeddings WHERE content_hash = ${hash}`)
        await db.execute(sql`DELETE FROM reference_documents WHERE content_hash = ${hash}`)
      } catch {}
    }
    process.exit(1)
  }

  // Check HNSW index status
  console.log("\nChecking HNSW index...")
  try {
    const indexes = await db.execute(sql`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE tablename = 'reference_embeddings'
      AND indexdef LIKE '%hnsw%'
    `)
    const indexList = indexes as unknown as { indexname: string; indexdef: string }[]
    if (indexList.length > 0) {
      console.log(`✅ HNSW index exists: ${indexList[0].indexname}`)
    } else {
      console.log("⚠️  No HNSW index found (will be created after bulk load)")
    }
  } catch (error) {
    console.log("⚠️  Could not check HNSW index:", error)
  }

  console.log("\n" + "=".repeat(60))
  console.log("\n✅ Database Audit Complete")
}

main().catch((e) => {
  console.error("Audit failed:", e)
  process.exit(1)
})
