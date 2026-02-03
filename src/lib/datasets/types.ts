/**
 * @fileoverview Dataset Types
 *
 * Type definitions for the reference dataset parsers.
 * Maps directly to the database schema for referenceDocuments and referenceEmbeddings.
 *
 * @module lib/datasets/types
 */

/**
 * Dataset source identifiers - matches DB schema exactly
 */
export type DatasetSource = "cuad" | "contract_nli" | "bonterms" | "commonaccord"

/**
 * Granularity levels for embeddings - matches DB schema exactly
 */
export type EmbeddingGranularity = "document" | "section" | "clause" | "span" | "template"

/**
 * NLI labels from ContractNLI dataset
 */
export type NliLabel = "entailment" | "contradiction" | "not_mentioned"

/**
 * Unified output format from all parsers.
 * Maps directly to referenceDocuments + referenceEmbeddings tables.
 */
export interface NormalizedRecord {
  /** Dataset source identifier */
  source: DatasetSource

  /** Unique ID within the source dataset */
  sourceId: string

  /** Text content to be embedded */
  content: string

  /** Embedding granularity level */
  granularity: EmbeddingGranularity

  /** Hierarchical path within document (e.g., ["NDA", "Confidentiality", "Exceptions"]) */
  sectionPath: string[]

  /** CUAD category or template section type */
  category?: string

  /** ContractNLI hypothesis ID (1-17) */
  hypothesisId?: number

  /** ContractNLI NLI label */
  nliLabel?: NliLabel

  /** Arbitrary metadata from source */
  metadata: Record<string, unknown>

  /** SHA-256 hash of content for deduplication */
  contentHash: string
}

/**
 * CUAD's 41 legal clause categories
 */
export const CUAD_CATEGORIES = [
  "Document Name",
  "Parties",
  "Agreement Date",
  "Effective Date",
  "Expiration Date",
  "Renewal Term",
  "Notice Period To Terminate Renewal",
  "Governing Law",
  "Most Favored Nation",
  "Non-Compete",
  "Exclusivity",
  "No-Solicit Of Customers",
  "No-Solicit Of Employees",
  "Non-Disparagement",
  "Termination For Convenience",
  "Rofr/Rofo/Rofn",
  "Change Of Control",
  "Anti-Assignment",
  "Revenue/Profit Sharing",
  "Price Restrictions",
  "Minimum Commitment",
  "Volume Restriction",
  "Ip Ownership Assignment",
  "Joint Ip Ownership",
  "License Grant",
  "Non-Transferable License",
  "Affiliate License-Licensor",
  "Affiliate License-Licensee",
  "Unlimited/All-You-Can-Eat-License",
  "Irrevocable Or Perpetual License",
  "Source Code Escrow",
  "Post-Termination Services",
  "Audit Rights",
  "Uncapped Liability",
  "Cap On Liability",
  "Liquidated Damages",
  "Warranty Duration",
  "Insurance",
  "Covenant Not To Sue",
  "Third Party Beneficiary",
] as const

export type CuadCategory = (typeof CUAD_CATEGORIES)[number]

/**
 * ContractNLI's 17 hypothesis definitions
 */
export const NLI_HYPOTHESES: Record<number, string> = {
  1: "All Confidential Information shall be expressly identified by the Disclosing Party.",
  2: "Confidential Information shall only include technical information.",
  3: "All Confidential Information shall be returned to the Disclosing Party upon termination of the Agreement.",
  4: "Confidential Information may be acquired independently.",
  5: "Confidential Information may be disclosed to employees.",
  6: "Confidential Information may be shared with third-parties with permission.",
  7: "Confidential Information may be disclosed pursuant to law.",
  8: "Receiving Party shall not disclose the fact that Agreement was agreed.",
  9: "Receiving Party shall not disclose the terms of Agreement.",
  10: "Receiving Party shall not solicit Disclosing Party's employees.",
  11: "Receiving Party shall not solicit Disclosing Party's customers.",
  12: "Receiving Party shall not use Confidential Information for competing business.",
  13: "Agreement shall be valid for some period after termination.",
  14: "Agreement shall not grant Receiving Party any right to Confidential Information.",
  15: "Receiving Party may create derivative works from Confidential Information.",
  16: "Receiving Party may retain some Confidential Information.",
  17: "Some obligations of Agreement may survive termination.",
}

/**
 * Raw CUAD record from Parquet file
 */
export interface CuadRawRecord {
  contract_name: string
  contract_text: string
  category: string
  clause_text: string
  start_ix: number
  end_ix: number
}

/**
 * Raw ContractNLI record from JSON file
 */
export interface ContractNliRawRecord {
  id: string
  text: string
  spans: Array<{
    start: number
    end: number
    text: string
  }>
  annotations: Record<
    string,
    {
      choice: "Entailment" | "Contradiction" | "NotMentioned"
      spans: number[]
    }
  >
}
