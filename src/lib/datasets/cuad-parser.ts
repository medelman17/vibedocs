/**
 * @fileoverview CUAD Dataset Parser
 *
 * Parses the CUAD (Contract Understanding Atticus Dataset) Parquet file
 * and yields normalized records at document and clause granularities.
 *
 * @module lib/datasets/cuad-parser
 */

import { readFile } from "fs/promises"
import { tableFromIPC } from "apache-arrow"
import type { NormalizedRecord, CuadCategory } from "./types"
import { generateContentHash, normalizeText } from "./utils"

// Lazy-loaded parquet-wasm module (Node version doesn't need explicit WASM init)
let parquetModule: typeof import("parquet-wasm/node") | null = null

async function getParquetModule() {
  if (!parquetModule) {
    parquetModule = await import("parquet-wasm/node")
  }
  return parquetModule
}

/**
 * Parse CUAD Parquet dataset and yield normalized records.
 *
 * Outputs at TWO granularities:
 * - "document": Full contract text (deduplicated by contract_name)
 * - "clause": Individual annotated clauses with CUAD category
 */
export async function* parseCuadDataset(
  parquetPath: string
): AsyncGenerator<NormalizedRecord> {
  const parquet = await getParquetModule()

  // Read Parquet file
  const buffer = await readFile(parquetPath)
  const wasmTable = parquet.readParquet(new Uint8Array(buffer))
  const arrowTable = tableFromIPC(wasmTable.intoIPCStream())

  // Track seen contracts for document-level deduplication
  const seenContracts = new Set<string>()

  // Iterate over rows
  for (let i = 0; i < arrowTable.numRows; i++) {
    const row = arrowTable.get(i)
    if (!row) continue

    const contractName = String(row.contract_name ?? "")
    const contractText = normalizeText(String(row.contract_text ?? ""))
    const clauseText = normalizeText(String(row.clause_text ?? ""))
    const category = String(row.category ?? "") as CuadCategory
    const startIx = Number(row.start_ix ?? 0)
    const endIx = Number(row.end_ix ?? 0)

    // Yield document-level record (once per contract)
    if (contractName && !seenContracts.has(contractName)) {
      seenContracts.add(contractName)

      yield {
        source: "cuad",
        sourceId: `cuad:doc:${contractName}`,
        content: contractText,
        granularity: "document",
        sectionPath: [],
        metadata: {
          contractName,
        },
        contentHash: generateContentHash(contractText),
      }
    }

    // Yield clause-level record
    if (clauseText) {
      yield {
        source: "cuad",
        sourceId: `cuad:clause:${contractName}:${startIx}-${endIx}`,
        content: clauseText,
        granularity: "clause",
        sectionPath: [category],
        category,
        metadata: {
          contractName,
          startIndex: startIx,
          endIndex: endIx,
        },
        contentHash: generateContentHash(clauseText),
      }
    }
  }
}

/**
 * Get CUAD dataset statistics
 */
export async function getCuadStats(parquetPath: string): Promise<{
  totalContracts: number
  totalClauses: number
  categoryCounts: Record<string, number>
}> {
  const contracts = new Set<string>()
  const categoryCounts: Record<string, number> = {}
  let totalClauses = 0

  for await (const record of parseCuadDataset(parquetPath)) {
    if (record.granularity === "document") {
      contracts.add(record.sourceId)
    } else if (record.granularity === "clause") {
      totalClauses++
      const cat = record.category || "unknown"
      categoryCounts[cat] = (categoryCounts[cat] || 0) + 1
    }
  }

  return {
    totalContracts: contracts.size,
    totalClauses,
    categoryCounts,
  }
}
