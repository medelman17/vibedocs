#!/usr/bin/env npx tsx
/**
 * Embedding Audit Script
 *
 * Tests the Voyage AI embedding client with realistic batches.
 *
 * Usage: pnpm tsx scripts/audit-embeddings.ts
 */

import { config } from "dotenv"
config({ path: ".env.local" })

import { join } from "path"

const CACHE_DIR = ".cache/datasets"
const BATCH_SIZE = 128

interface AuditResult {
  batchesTested: number
  totalTexts: number
  totalTokens: number
  errors: string[]
  avgLatency: number
  success: boolean
}

async function main() {
  console.log("🔍 Embedding Audit\n")

  // Check API key
  if (!process.env.VOYAGE_API_KEY) {
    console.error("❌ VOYAGE_API_KEY not set in .env.local")
    process.exit(1)
  }
  console.log("✅ VOYAGE_API_KEY is set")

  // Import embedding client
  const { getVoyageAIClient, VOYAGE_CONFIG } = await import(
    "../lib/embeddings"
  )
  console.log(`✅ Using model: ${VOYAGE_CONFIG.model}`)
  console.log(`   Batch limit: ${VOYAGE_CONFIG.batchLimit}`)
  console.log(`   Dimensions: ${VOYAGE_CONFIG.dimensions}`)

  // Collect sample texts from parsers
  console.log("\nCollecting sample texts...")
  const { parseCuadDataset } = await import("../lib/datasets/cuad-parser")
  const path = join(CACHE_DIR, "cuad-v1")

  const texts: string[] = []
  let count = 0
  for await (const record of parseCuadDataset(path)) {
    if (record.content && record.content.trim().length > 0) {
      texts.push(record.content)
      count++
      if (count >= BATCH_SIZE * 3) break // Get 3 batches worth
    }
  }
  console.log(`   Collected ${texts.length} texts`)

  // Test batching
  const result: AuditResult = {
    batchesTested: 0,
    totalTexts: 0,
    totalTokens: 0,
    errors: [],
    avgLatency: 0,
    success: false,
  }

  const client = getVoyageAIClient()
  const latencies: number[] = []

  console.log("\nTesting embedding batches...")
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE)
    result.batchesTested++

    const start = Date.now()
    try {
      const embedResult = await client.embedBatch(batch, "document")
      const latency = Date.now() - start
      latencies.push(latency)

      console.log(
        `   Batch ${result.batchesTested}: ${batch.length} texts, ${embedResult.totalTokens} tokens, ${latency}ms`
      )

      result.totalTexts += batch.length
      result.totalTokens += embedResult.totalTokens

      // Validate embeddings
      if (embedResult.embeddings.length !== batch.length) {
        result.errors.push(
          `Batch ${result.batchesTested}: Expected ${batch.length} embeddings, got ${embedResult.embeddings.length}`
        )
      }

      for (let j = 0; j < embedResult.embeddings.length; j++) {
        const emb = embedResult.embeddings[j]
        if (!emb || emb.length !== VOYAGE_CONFIG.dimensions) {
          result.errors.push(
            `Batch ${result.batchesTested}, item ${j}: Invalid embedding dimensions (${emb?.length ?? 0})`
          )
        }
      }

      // Rate limit delay
      if (i + BATCH_SIZE < texts.length) {
        console.log("   Waiting 250ms for rate limit...")
        await new Promise((r) => setTimeout(r, 250))
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error)
      result.errors.push(`Batch ${result.batchesTested}: ${message}`)
      console.error(`   ❌ Batch ${result.batchesTested} failed: ${message}`)
    }
  }

  result.avgLatency =
    latencies.length > 0
      ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
      : 0
  result.success = result.errors.length === 0

  // Summary
  console.log("\n" + "=".repeat(60))
  console.log(`\n${result.success ? "✅" : "❌"} Embedding Audit Results`)
  console.log(`   Batches tested: ${result.batchesTested}`)
  console.log(`   Total texts: ${result.totalTexts}`)
  console.log(`   Total tokens: ${result.totalTokens}`)
  console.log(`   Avg latency: ${result.avgLatency}ms`)

  if (result.errors.length > 0) {
    console.log(`\n   Errors (${result.errors.length}):`)
    for (const error of result.errors.slice(0, 5)) {
      console.log(`     - ${error}`)
    }
    if (result.errors.length > 5) {
      console.log(`     ... and ${result.errors.length - 5} more`)
    }
  }

  // Cost estimate
  const costPer1M = 0.12 // voyage-law-2 pricing
  const estimatedCost = (result.totalTokens / 1_000_000) * costPer1M
  console.log(`\n   Estimated cost for tested texts: $${estimatedCost.toFixed(4)}`)

  // Full dataset estimate
  const totalRecords = 14000 + 10000 // CUAD + ContractNLI
  const avgTokensPerText = result.totalTexts > 0 ? result.totalTokens / result.totalTexts : 500
  const fullDatasetTokens = totalRecords * avgTokensPerText
  const fullDatasetCost = (fullDatasetTokens / 1_000_000) * costPer1M
  console.log(`   Estimated cost for full dataset (~${totalRecords} records): $${fullDatasetCost.toFixed(2)}`)

  if (!result.success) {
    process.exit(1)
  }
}

main().catch((e) => {
  console.error("Audit failed:", e)
  process.exit(1)
})
