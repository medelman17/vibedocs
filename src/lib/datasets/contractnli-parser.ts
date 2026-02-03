/**
 * @fileoverview ContractNLI Dataset Parser
 *
 * Parses the ContractNLI Parquet dataset (HuggingFace format) and yields
 * normalized records at document and span granularities with NLI labels.
 *
 * @module lib/datasets/contractnli-parser
 */

import { ParquetReader } from "@dsnp/parquetjs"
import type { NormalizedRecord, NliLabel } from "./types"
import { NLI_HYPOTHESES } from "./types"
import { generateContentHash, normalizeText } from "./utils"

/**
 * Parse ContractNLI Parquet dataset and yield normalized records.
 *
 * The HuggingFace Parquet format has columns:
 * - premise: The contract text (evidence span)
 * - hypothesis: The NLI hypothesis text
 * - label: 0=entailment, 1=not_mentioned, 2=contradiction
 *
 * We yield at "span" granularity since each row is an individual premise-hypothesis pair.
 */
export async function* parseContractNliDataset(
  parquetPath: string
): AsyncGenerator<NormalizedRecord> {
  // Open Parquet file
  const reader = await ParquetReader.openFile(parquetPath)
  const cursor = reader.getCursor()

  // Track seen documents for document-level deduplication
  const seenDocuments = new Set<string>()
  let rowIndex = 0

  // Read rows one by one
  let row: Record<string, unknown> | null
  while ((row = await cursor.next())) {
    const premise = normalizeText(String(row.premise ?? ""))
    const hypothesis = String(row.hypothesis ?? "")
    const labelNum = Number(row.label ?? 1)

    // Map numeric label to NLI label
    // Based on HuggingFace dataset: 0=entailment, 1=not_mentioned, 2=contradiction
    const nliLabel = mapLabelToNli(labelNum)

    // Find hypothesis ID by matching text
    const hypothesisId = findHypothesisId(hypothesis)

    // Create a document hash from the premise for deduplication
    const premiseHash = generateContentHash(premise)

    // Yield document-level record (once per unique premise)
    if (premise && !seenDocuments.has(premiseHash)) {
      seenDocuments.add(premiseHash)

      yield {
        source: "contract_nli",
        sourceId: `cnli:doc:${premiseHash.slice(0, 12)}`,
        content: premise,
        granularity: "document",
        sectionPath: [],
        metadata: {
          premiseHash,
        },
        contentHash: premiseHash,
      }
    }

    // Yield span-level record for each premise-hypothesis pair
    if (premise) {
      yield {
        source: "contract_nli",
        sourceId: `cnli:span:${rowIndex}`,
        content: premise,
        granularity: "span",
        sectionPath: [hypothesis],
        hypothesisId,
        nliLabel,
        metadata: {
          rowIndex,
          hypothesis,
          labelNum,
        },
        contentHash: generateContentHash(`${premise}:${hypothesis}`),
      }
    }

    rowIndex++
  }

  await reader.close()
}

/**
 * Map numeric label to NLI label string
 */
function mapLabelToNli(label: number): NliLabel {
  switch (label) {
    case 0:
      return "entailment"
    case 2:
      return "contradiction"
    case 1:
    default:
      return "not_mentioned"
  }
}

/**
 * Find hypothesis ID by matching hypothesis text
 */
function findHypothesisId(hypothesis: string): number {
  const normalized = hypothesis.toLowerCase().trim()
  for (const [id, text] of Object.entries(NLI_HYPOTHESES)) {
    if (text.toLowerCase().includes(normalized.slice(0, 30)) ||
        normalized.includes(text.toLowerCase().slice(0, 30))) {
      return parseInt(id, 10)
    }
  }
  // Return a hash-based ID for unknown hypotheses
  return Math.abs(hashCode(hypothesis)) % 1000
}

/**
 * Simple hash code for string
 */
function hashCode(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // Convert to 32bit integer
  }
  return hash
}

/**
 * Get ContractNLI dataset statistics
 */
export async function getContractNliStats(parquetPath: string): Promise<{
  totalDocuments: number
  totalSpans: number
  labelCounts: Record<NliLabel, number>
  hypothesisCounts: Record<number, number>
}> {
  const documents = new Set<string>()
  const labelCounts: Record<NliLabel, number> = {
    entailment: 0,
    contradiction: 0,
    not_mentioned: 0,
  }
  const hypothesisCounts: Record<number, number> = {}
  let totalSpans = 0

  for await (const record of parseContractNliDataset(parquetPath)) {
    if (record.granularity === "document") {
      documents.add(record.sourceId)
    } else if (record.granularity === "span") {
      totalSpans++
      if (record.nliLabel) {
        labelCounts[record.nliLabel]++
      }
      if (record.hypothesisId !== undefined) {
        hypothesisCounts[record.hypothesisId] =
          (hypothesisCounts[record.hypothesisId] || 0) + 1
      }
    }
  }

  return {
    totalDocuments: documents.size,
    totalSpans,
    labelCounts,
    hypothesisCounts,
  }
}
