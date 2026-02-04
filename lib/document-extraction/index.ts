/**
 * @fileoverview Document extraction module
 *
 * Lightweight barrel export safe for bundling.
 * Heavy dependencies (pdf-parse) use dynamic import in extractors.
 *
 * @module lib/document-extraction
 */

// Types
export type {
  ExtractionResult,
  QualityMetrics,
  ExtractionWarning,
  DocumentMetadata,
} from './types'

// Extractors
export { extractPdf } from './pdf-extractor'
export { extractDocx } from './docx-extractor'

// Validators
export { validateExtractionQuality, detectLanguage } from './validators'
