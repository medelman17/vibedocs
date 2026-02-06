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
  // Structure types
  DocumentStructure,
  DocumentSection,
  PositionedSection,
  PartyInfo,
  SectionType,
} from './types'

// Extractors
// NOTE: extractPdf is NOT exported here — it must be dynamically imported
// to avoid loading pdf-parse (which depends on pdfjs-dist/DOMMatrix) at
// module evaluation time. Use: const { extractPdf } = await import('./pdf-extractor')
export { extractDocx } from './docx-extractor'

// Validators
export { validateExtractionQuality, detectLanguage } from './validators'

// Structure detection
export { detectStructure, parseObviousStructure } from './structure-detector'

// Unified extraction
export { extractDocument, type ExtractDocumentOptions } from './extract-document'
