/**
 * @fileoverview ContractNLI Dataset Parser
 *
 * Parses the ContractNLI JSON dataset and yields normalized records
 * at document and span granularities with NLI labels.
 *
 * @module lib/datasets/contractnli-parser
 */

import { readFile } from "fs/promises"
import type { NormalizedRecord, ContractNliRawRecord, NliLabel } from "./types"
import { NLI_HYPOTHESES } from "./types"
import { generateContentHash, normalizeText, normalizeNliLabel } from "./utils"

/**
 * Parse ContractNLI JSON dataset and yield normalized records.
 *
 * Outputs at TWO granularities:
 * - "document": Full contract text
 * - "span": Evidence spans with hypothesis ID and NLI label
 */
export async function* parseContractNliDataset(
  jsonPath: string
): AsyncGenerator<NormalizedRecord> {
  const raw = await readFile(jsonPath, "utf-8")
  const data = JSON.parse(raw) as ContractNliRawRecord[]

  for (const record of data) {
    const contractText = normalizeText(record.text)
    const contractId = record.id

    // Yield document-level record
    yield {
      source: "contract_nli",
      sourceId: `cnli:doc:${contractId}`,
      content: contractText,
      granularity: "document",
      sectionPath: [],
      metadata: {
        originalId: contractId,
        spanCount: record.spans.length,
        annotationCount: Object.keys(record.annotations).length,
      },
      contentHash: generateContentHash(contractText),
    }

    // Yield span-level records for each annotation
    for (const [hypothesisIdStr, annotation] of Object.entries(record.annotations)) {
      const hypothesisId = parseInt(hypothesisIdStr, 10)
      const nliLabel = normalizeNliLabel(annotation.choice)
      const hypothesisText = NLI_HYPOTHESES[hypothesisId] || `Hypothesis ${hypothesisId}`

      // Get evidence spans for this annotation
      for (const spanIndex of annotation.spans) {
        const span = record.spans[spanIndex]
        if (!span) continue

        const spanText = normalizeText(span.text)

        yield {
          source: "contract_nli",
          sourceId: `cnli:span:${contractId}:h${hypothesisId}:${spanIndex}`,
          content: spanText,
          granularity: "span",
          sectionPath: [hypothesisText],
          hypothesisId,
          nliLabel,
          metadata: {
            contractId,
            spanIndex,
            startOffset: span.start,
            endOffset: span.end,
            hypothesisText,
          },
          contentHash: generateContentHash(spanText),
        }
      }
    }
  }
}

/**
 * Get ContractNLI dataset statistics
 */
export async function getContractNliStats(jsonPath: string): Promise<{
  totalContracts: number
  totalSpans: number
  labelCounts: Record<NliLabel, number>
  hypothesisCounts: Record<number, number>
}> {
  const contracts = new Set<string>()
  const labelCounts: Record<NliLabel, number> = {
    entailment: 0,
    contradiction: 0,
    not_mentioned: 0,
  }
  const hypothesisCounts: Record<number, number> = {}
  let totalSpans = 0

  for await (const record of parseContractNliDataset(jsonPath)) {
    if (record.granularity === "document") {
      contracts.add(record.sourceId)
    } else if (record.granularity === "span") {
      totalSpans++
      if (record.nliLabel) {
        labelCounts[record.nliLabel]++
      }
      if (record.hypothesisId) {
        hypothesisCounts[record.hypothesisId] =
          (hypothesisCounts[record.hypothesisId] || 0) + 1
      }
    }
  }

  return {
    totalContracts: contracts.size,
    totalSpans,
    labelCounts,
    hypothesisCounts,
  }
}
