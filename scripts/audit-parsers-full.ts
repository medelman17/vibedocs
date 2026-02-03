#!/usr/bin/env npx tsx
/**
 * Full Parser Audit Script
 *
 * Tests each dataset parser with ALL records to find volume-related issues.
 *
 * Usage: pnpm tsx scripts/audit-parsers-full.ts [parser]
 *   parser: cuad, contractnli, bonterms, commonaccord, all (default: all)
 */

import { join } from "path"

const CACHE_DIR = ".cache/datasets"

interface AuditResult {
  parser: string
  success: boolean
  documentCount: number
  clauseCount: number
  spanCount: number
  sectionCount: number
  templateCount: number
  emptyContentCount: number
  errors: string[]
  duration: number
  memoryUsedMB: number
}

function getMemoryUsage(): number {
  return Math.round(process.memoryUsage().heapUsed / 1024 / 1024)
}

async function auditCuad(): Promise<AuditResult> {
  const result: AuditResult = {
    parser: "CUAD",
    success: false,
    documentCount: 0,
    clauseCount: 0,
    spanCount: 0,
    sectionCount: 0,
    templateCount: 0,
    emptyContentCount: 0,
    errors: [],
    duration: 0,
    memoryUsedMB: 0,
  }

  const start = Date.now()
  const startMem = getMemoryUsage()

  try {
    const { parseCuadDataset } = await import("../src/lib/datasets/cuad-parser")
    const path = join(CACHE_DIR, "cuad-v1")

    let count = 0
    for await (const record of parseCuadDataset(path)) {
      count++
      if (!record.content || record.content.trim().length === 0) {
        result.emptyContentCount++
      }
      if (record.granularity === "document") result.documentCount++
      if (record.granularity === "clause") result.clauseCount++

      // Progress every 1000 records
      if (count % 1000 === 0) {
        console.log(`  CUAD: ${count} records, ${getMemoryUsage()}MB memory`)
      }
    }
    result.success = true
  } catch (error) {
    result.errors.push(error instanceof Error ? `${error.message}\n${error.stack}` : String(error))
  }

  result.duration = Date.now() - start
  result.memoryUsedMB = getMemoryUsage() - startMem
  return result
}

async function auditContractNli(): Promise<AuditResult> {
  const result: AuditResult = {
    parser: "ContractNLI",
    success: false,
    documentCount: 0,
    clauseCount: 0,
    spanCount: 0,
    sectionCount: 0,
    templateCount: 0,
    emptyContentCount: 0,
    errors: [],
    duration: 0,
    memoryUsedMB: 0,
  }

  const start = Date.now()
  const startMem = getMemoryUsage()

  try {
    const { parseContractNliDataset } = await import(
      "../src/lib/datasets/contractnli-parser"
    )
    const path = join(CACHE_DIR, "contract_nli_train.parquet")

    let count = 0
    for await (const record of parseContractNliDataset(path)) {
      count++
      if (!record.content || record.content.trim().length === 0) {
        result.emptyContentCount++
      }
      if (record.granularity === "document") result.documentCount++
      if (record.granularity === "span") result.spanCount++

      // Progress every 1000 records
      if (count % 1000 === 0) {
        console.log(`  ContractNLI: ${count} records, ${getMemoryUsage()}MB memory`)
      }
    }
    result.success = true
  } catch (error) {
    result.errors.push(error instanceof Error ? `${error.message}\n${error.stack}` : String(error))
  }

  result.duration = Date.now() - start
  result.memoryUsedMB = getMemoryUsage() - startMem
  return result
}

async function auditBonterms(): Promise<AuditResult> {
  const result: AuditResult = {
    parser: "Bonterms",
    success: false,
    documentCount: 0,
    clauseCount: 0,
    spanCount: 0,
    sectionCount: 0,
    templateCount: 0,
    emptyContentCount: 0,
    errors: [],
    duration: 0,
    memoryUsedMB: 0,
  }

  const start = Date.now()
  const startMem = getMemoryUsage()

  try {
    const { parseBontermsDataset } = await import(
      "../src/lib/datasets/template-parser"
    )
    const path = join(CACHE_DIR, "bonterms-nda")

    for await (const record of parseBontermsDataset(path)) {
      if (!record.content || record.content.trim().length === 0) {
        result.emptyContentCount++
      }
      if (record.granularity === "template") result.templateCount++
      if (record.granularity === "section") result.sectionCount++
    }
    result.success = true
  } catch (error) {
    result.errors.push(error instanceof Error ? `${error.message}\n${error.stack}` : String(error))
  }

  result.duration = Date.now() - start
  result.memoryUsedMB = getMemoryUsage() - startMem
  return result
}

async function auditCommonAccord(): Promise<AuditResult> {
  const result: AuditResult = {
    parser: "CommonAccord",
    success: false,
    documentCount: 0,
    clauseCount: 0,
    spanCount: 0,
    sectionCount: 0,
    templateCount: 0,
    emptyContentCount: 0,
    errors: [],
    duration: 0,
    memoryUsedMB: 0,
  }

  const start = Date.now()
  const startMem = getMemoryUsage()

  try {
    const { parseCommonAccordDataset } = await import(
      "../src/lib/datasets/template-parser"
    )
    const path = join(CACHE_DIR, "commonaccord-nda")

    for await (const record of parseCommonAccordDataset(path)) {
      if (!record.content || record.content.trim().length === 0) {
        result.emptyContentCount++
      }
      if (record.granularity === "template") result.templateCount++
      if (record.granularity === "section") result.sectionCount++
    }
    result.success = true
  } catch (error) {
    result.errors.push(error instanceof Error ? `${error.message}\n${error.stack}` : String(error))
  }

  result.duration = Date.now() - start
  result.memoryUsedMB = getMemoryUsage() - startMem
  return result
}

function printResult(result: AuditResult) {
  const status = result.success ? "✅" : "❌"
  console.log(`\n${status} ${result.parser}`)
  console.log(`   Duration: ${(result.duration / 1000).toFixed(1)}s`)
  console.log(`   Memory delta: ${result.memoryUsedMB}MB`)

  const counts = []
  if (result.documentCount) counts.push(`${result.documentCount} documents`)
  if (result.clauseCount) counts.push(`${result.clauseCount} clauses`)
  if (result.spanCount) counts.push(`${result.spanCount} spans`)
  if (result.templateCount) counts.push(`${result.templateCount} templates`)
  if (result.sectionCount) counts.push(`${result.sectionCount} sections`)
  console.log(`   Records: ${counts.join(", ")}`)

  if (result.emptyContentCount > 0) {
    console.log(`   ⚠️  Empty content: ${result.emptyContentCount}`)
  }

  if (result.errors.length > 0) {
    console.log(`   Errors:`)
    for (const error of result.errors) {
      console.log(`     ${error.split("\n")[0]}`)
    }
  }
}

async function main() {
  const target = process.argv[2] || "all"

  console.log("🔍 Full Parser Audit\n")
  console.log(`Initial memory: ${getMemoryUsage()}MB`)
  console.log("=".repeat(60))

  const auditors: Record<string, () => Promise<AuditResult>> = {
    cuad: auditCuad,
    contractnli: auditContractNli,
    bonterms: auditBonterms,
    commonaccord: auditCommonAccord,
  }

  const results: AuditResult[] = []

  if (target === "all") {
    for (const [name, auditor] of Object.entries(auditors)) {
      console.log(`\nAuditing ${name}...`)
      const result = await auditor()
      results.push(result)
      printResult(result)
    }
  } else if (auditors[target]) {
    console.log(`\nAuditing ${target}...`)
    const result = await auditors[target]()
    results.push(result)
    printResult(result)
  } else {
    console.error(`Unknown parser: ${target}`)
    console.error(`Valid options: ${Object.keys(auditors).join(", ")}, all`)
    process.exit(1)
  }

  // Summary
  console.log("\n" + "=".repeat(60))
  const passed = results.filter((r) => r.success).length
  const total = results.length
  console.log(`\nSummary: ${passed}/${total} parsers completed`)
  console.log(`Final memory: ${getMemoryUsage()}MB`)

  if (passed < total) {
    process.exit(1)
  }
}

main().catch((e) => {
  console.error("Audit failed:", e)
  process.exit(1)
})
