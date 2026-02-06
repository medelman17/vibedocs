/**
 * @fileoverview Inngest Function Registry
 *
 * Barrel export for all Inngest functions. The serve handler imports
 * from this file to register all functions with Inngest.
 *
 * @module inngest/functions
 */

// Bootstrap pipeline (coordinator + source workers)
import { ingestCoordinator } from "./bootstrap/ingest-coordinator"
import { ingestSource } from "./bootstrap/ingest-source"

// Analysis pipeline
import { analyzeNda, analyzeNdaAfterOcr } from "./analyze-nda"
import { ndaParse } from "./nda-parse"
import { ndaChunkEmbed } from "./nda-chunk-embed"
import { ndaClassify } from "./nda-classify"
import { ndaScoreRisks } from "./nda-score-risks"
import { ndaAnalyzeGaps } from "./nda-analyze-gaps"
import { rescoreAnalysis } from "./rescore-analysis"
import { ocrDocument } from "./ocr-document"
import { cleanupCancelledAnalysis } from "./cleanup-cancelled"

// Production functions - will be populated as functions are created
// import { processDocument } from "./process-document"
// import { compareNdas } from "./compare-ndas"
// import { generateNda } from "./generate-nda"
// import { generateEmbeddings } from "./embeddings"

/**
 * All registered Inngest functions.
 * Add new functions to this array as they are created.
 */
export const functions = [
  // Bootstrap functions (coordinator + source workers)
  ingestCoordinator,
  ingestSource,

  // Analysis pipeline - orchestrators
  analyzeNda,
  analyzeNdaAfterOcr,

  // Analysis pipeline - sub-functions (invoked via step.invoke)
  ndaParse,
  ndaChunkEmbed,
  ndaClassify,
  ndaScoreRisks,
  ndaAnalyzeGaps,

  // Analysis pipeline - supporting
  rescoreAnalysis,
  ocrDocument,
  cleanupCancelledAnalysis,

  // Production functions - TBD
  // processDocument,
  // compareNdas,
  // generateNda,
  // generateEmbeddings,
]
