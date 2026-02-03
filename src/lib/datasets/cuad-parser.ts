/**
 * @fileoverview CUAD Dataset Parser
 *
 * Parses the CUAD (Contract Understanding Atticus Dataset) v1 JSON file
 * and yields normalized records at document and clause granularities.
 *
 * CUAD v1 format (SQuAD-style):
 * - data[].title: contract name
 * - data[].paragraphs[].context: full contract text
 * - data[].paragraphs[].qas[]: questions about clauses
 *   - question: clause category (e.g., "Highlight the parts...")
 *   - answers[]: extracted clause spans
 *
 * @module lib/datasets/cuad-parser
 */

import { readFile } from "fs/promises"
import { join } from "path"
import type { NormalizedRecord, CuadCategory } from "./types"
import { generateContentHash, normalizeText } from "./utils"

// CUAD clause categories mapped from question patterns
const CLAUSE_CATEGORIES: Record<string, CuadCategory> = {
  "document name": "Document Name",
  parties: "Parties",
  "agreement date": "Agreement Date",
  "effective date": "Effective Date",
  "expiration date": "Expiration Date",
  "renewal term": "Renewal Term",
  "notice period to terminate renewal": "Notice Period To Terminate Renewal",
  "governing law": "Governing Law",
  "most favored nation": "Most Favored Nation",
  "non-compete": "Non-Compete",
  "exclusivity": "Exclusivity",
  "no-solicit of customers": "No-Solicit Of Customers",
  "no-solicit of employees": "No-Solicit Of Employees",
  "non-disparagement": "Non-Disparagement",
  "termination for convenience": "Termination For Convenience",
  "rofr/rofo/rofn": "Rofr/Rofo/Rofn",
  "change of control": "Change Of Control",
  "anti-assignment": "Anti-Assignment",
  "revenue/profit sharing": "Revenue/Profit Sharing",
  "price restrictions": "Price Restrictions",
  "minimum commitment": "Minimum Commitment",
  "volume restriction": "Volume Restriction",
  "ip ownership assignment": "IP Ownership Assignment",
  "joint ip ownership": "Joint IP Ownership",
  "license grant": "License Grant",
  "non-transferable license": "Non-Transferable License",
  "affiliate license-licensor": "Affiliate License-Licensor",
  "affiliate license-licensee": "Affiliate License-Licensee",
  "unlimited/all-you-can-eat-license": "Unlimited/All-You-Can-Eat-License",
  "irrevocable or perpetual license": "Irrevocable Or Perpetual License",
  "source code escrow": "Source Code Escrow",
  "post-termination services": "Post-Termination Services",
  "audit rights": "Audit Rights",
  "uncapped liability": "Uncapped Liability",
  "cap on liability": "Cap On Liability",
  "liquidated damages": "Liquidated Damages",
  "warranty duration": "Warranty Duration",
  "insurance": "Insurance",
  "covenant not to sue": "Covenant Not To Sue",
  "third party beneficiary": "Third Party Beneficiary",
}

interface CuadAnswer {
  text: string
  answer_start: number
}

interface CuadQA {
  question: string
  id: string
  is_impossible: boolean
  answers: CuadAnswer[]
}

interface CuadParagraph {
  context: string
  qas: CuadQA[]
}

interface CuadDocument {
  title: string
  paragraphs: CuadParagraph[]
}

interface CuadDataset {
  version: string
  data: CuadDocument[]
}

/**
 * Extract category from question text
 */
function extractCategory(question: string): CuadCategory | null {
  const normalized = question.toLowerCase()
  for (const [pattern, category] of Object.entries(CLAUSE_CATEGORIES)) {
    if (normalized.includes(pattern)) {
      return category
    }
  }
  return null
}

/**
 * Parse CUAD v1 JSON dataset and yield normalized records.
 *
 * Outputs at TWO granularities:
 * - "document": Full contract text (deduplicated by contract title)
 * - "clause": Individual annotated clauses with CUAD category
 */
export async function* parseCuadDataset(
  datasetDir: string
): AsyncGenerator<NormalizedRecord> {
  // Read CUADv1.json from the dataset directory
  const jsonPath = join(datasetDir, "CUADv1.json")
  const raw = await readFile(jsonPath, "utf-8")
  const dataset = JSON.parse(raw) as CuadDataset

  // Track seen contracts for document-level deduplication
  const seenContracts = new Set<string>()
  // Track seen clauses for clause-level deduplication
  const seenClauses = new Set<string>()

  for (const doc of dataset.data) {
    const contractName = doc.title

    for (const paragraph of doc.paragraphs) {
      const contractText = normalizeText(paragraph.context)

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

      // Yield clause-level records from QA pairs
      for (const qa of paragraph.qas) {
        // Skip impossible questions (no clause found)
        if (qa.is_impossible || qa.answers.length === 0) {
          continue
        }

        const category = extractCategory(qa.question)
        if (!category) continue

        for (const answer of qa.answers) {
          const clauseText = normalizeText(answer.text)
          if (!clauseText) continue

          // Deduplicate clauses by content hash
          const clauseHash = generateContentHash(clauseText)
          const clauseKey = `${contractName}:${category}:${clauseHash}`
          if (seenClauses.has(clauseKey)) continue
          seenClauses.add(clauseKey)

          yield {
            source: "cuad",
            sourceId: `cuad:clause:${contractName}:${qa.id}`,
            content: clauseText,
            granularity: "clause",
            sectionPath: [category],
            category,
            metadata: {
              contractName,
              questionId: qa.id,
              answerStart: answer.answer_start,
              question: qa.question,
            },
            contentHash: clauseHash,
          }
        }
      }
    }
  }
}

/**
 * Get CUAD dataset statistics
 */
export async function getCuadStats(datasetDir: string): Promise<{
  totalContracts: number
  totalClauses: number
  categoryCounts: Record<string, number>
}> {
  const contracts = new Set<string>()
  const categoryCounts: Record<string, number> = {}
  let totalClauses = 0

  for await (const record of parseCuadDataset(datasetDir)) {
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
