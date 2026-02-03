/**
 * @fileoverview Dataset Parsers Barrel Export
 *
 * Unified exports for all reference dataset parsers.
 *
 * @module lib/datasets
 */

// Types
export type {
  DatasetSource,
  EmbeddingGranularity,
  NliLabel,
  NormalizedRecord,
  CuadRawRecord,
  ContractNliRawRecord,
  CuadCategory,
} from "./types"

export { CUAD_CATEGORIES, NLI_HYPOTHESES } from "./types"

// Utilities
export {
  generateContentHash,
  normalizeText,
  parseHeading,
  buildSectionPath,
  normalizeNliLabel,
} from "./utils"

// Parsers
export { parseCuadDataset, getCuadStats } from "./cuad-parser"
export { parseContractNliDataset, getContractNliStats } from "./contractnli-parser"
export {
  parseMarkdownTemplate,
  parseBontermsDataset,
  parseCommonAccordDataset,
  getTemplateStats,
} from "./template-parser"

// Downloader
export {
  downloadDataset,
  downloadAllDatasets,
  getDatasetPath,
  isDatasetCached,
  type DownloadResult,
} from "./downloader"
