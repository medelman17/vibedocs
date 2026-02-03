#!/usr/bin/env npx tsx
/**
 * Parser Audit Script
 *
 * Tests each dataset parser and reports issues.
 *
 * Usage: pnpm tsx scripts/audit-parsers.ts
 */

import { join } from "path"

const CACHE_DIR = ".cache/datasets"

interface AuditResult {
  parser: string
  success: boolean
  recordCount: number
  errors: string[]
  sampleRecords: unknown[]
  duration: number
}

async function auditCuad(): Promise<AuditResult> {
  const result: AuditResult = {
    parser: "CUAD",
    success: false,
    recordCount: 0,
    errors: [],
    sampleRecords: [],
    duration: 0,
  }

  const start = Date.now()
  try {
    const { parseCuadDataset } = await import("../lib/datasets/cuad-parser")
    const path = join(CACHE_DIR, "cuad-v1")

    for await (const record of parseCuadDataset(path)) {
      result.recordCount++
      if (result.sampleRecords.length < 3) {
        result.sampleRecords.push({
          sourceId: record.sourceId,
          granularity: record.granularity,
          contentLength: record.content?.length ?? 0,
          category: record.category,
          hasHash: !!record.contentHash,
        })
      }
      // Stop after 100 records for quick audit
      if (result.recordCount >= 100) break
    }
    result.success = true
  } catch (error) {
    result.errors.push(error instanceof Error ? error.message : String(error))
  }
  result.duration = Date.now() - start
  return result
}

async function auditContractNli(): Promise<AuditResult> {
  const result: AuditResult = {
    parser: "ContractNLI",
    success: false,
    recordCount: 0,
    errors: [],
    sampleRecords: [],
    duration: 0,
  }

  const start = Date.now()
  try {
    const { parseContractNliDataset } = await import(
      "../lib/datasets/contractnli-parser"
    )
    const path = join(CACHE_DIR, "contract_nli_train.parquet")

    for await (const record of parseContractNliDataset(path)) {
      result.recordCount++
      if (result.sampleRecords.length < 3) {
        result.sampleRecords.push({
          sourceId: record.sourceId,
          granularity: record.granularity,
          contentLength: record.content?.length ?? 0,
          nliLabel: record.nliLabel,
          hypothesisId: record.hypothesisId,
          hasHash: !!record.contentHash,
        })
      }
      // Stop after 100 records for quick audit
      if (result.recordCount >= 100) break
    }
    result.success = true
  } catch (error) {
    result.errors.push(error instanceof Error ? error.message : String(error))
  }
  result.duration = Date.now() - start
  return result
}

async function auditBonterms(): Promise<AuditResult> {
  const result: AuditResult = {
    parser: "Bonterms",
    success: false,
    recordCount: 0,
    errors: [],
    sampleRecords: [],
    duration: 0,
  }

  const start = Date.now()
  try {
    const { parseBontermsDataset } = await import(
      "../lib/datasets/template-parser"
    )
    const path = join(CACHE_DIR, "bonterms-nda")

    for await (const record of parseBontermsDataset(path)) {
      result.recordCount++
      if (result.sampleRecords.length < 3) {
        result.sampleRecords.push({
          sourceId: record.sourceId,
          granularity: record.granularity,
          contentLength: record.content?.length ?? 0,
          sectionPath: record.sectionPath,
          hasHash: !!record.contentHash,
        })
      }
    }
    result.success = true
  } catch (error) {
    result.errors.push(error instanceof Error ? error.message : String(error))
  }
  result.duration = Date.now() - start
  return result
}

async function auditCommonAccord(): Promise<AuditResult> {
  const result: AuditResult = {
    parser: "CommonAccord",
    success: false,
    recordCount: 0,
    errors: [],
    sampleRecords: [],
    duration: 0,
  }

  const start = Date.now()
  try {
    const { parseCommonAccordDataset } = await import(
      "../lib/datasets/template-parser"
    )
    const path = join(CACHE_DIR, "commonaccord-nda")

    for await (const record of parseCommonAccordDataset(path)) {
      result.recordCount++
      if (result.sampleRecords.length < 3) {
        result.sampleRecords.push({
          sourceId: record.sourceId,
          granularity: record.granularity,
          contentLength: record.content?.length ?? 0,
          sectionPath: record.sectionPath,
          hasHash: !!record.contentHash,
        })
      }
    }
    result.success = true
  } catch (error) {
    result.errors.push(error instanceof Error ? error.message : String(error))
  }
  result.duration = Date.now() - start
  return result
}

async function main() {
  console.log("🔍 Parser Audit Report\n")
  console.log("=".repeat(60) + "\n")

  const results = await Promise.all([
    auditCuad(),
    auditContractNli(),
    auditBonterms(),
    auditCommonAccord(),
  ])

  for (const result of results) {
    const status = result.success ? "✅" : "❌"
    console.log(`${status} ${result.parser}`)
    console.log(`   Records: ${result.recordCount}`)
    console.log(`   Duration: ${result.duration}ms`)

    if (result.errors.length > 0) {
      console.log(`   Errors:`)
      for (const error of result.errors) {
        console.log(`     - ${error}`)
      }
    }

    if (result.sampleRecords.length > 0) {
      console.log(`   Samples:`)
      for (const sample of result.sampleRecords) {
        console.log(`     ${JSON.stringify(sample)}`)
      }
    }
    console.log()
  }

  // Summary
  const passed = results.filter((r) => r.success).length
  const total = results.length
  console.log("=".repeat(60))
  console.log(`\nSummary: ${passed}/${total} parsers working\n`)

  if (passed < total) {
    process.exit(1)
  }
}

main().catch((e) => {
  console.error("Audit failed:", e)
  process.exit(1)
})
