/**
 * @fileoverview Inngest Function Registry
 *
 * Barrel export for all Inngest functions. The serve handler imports
 * from this file to register all functions with Inngest.
 *
 * @module inngest/functions
 */

// Demo functions (for testing Inngest setup)
import { demoProcess, demoMultiStep } from "./demo"

// Bootstrap pipeline (coordinator + source workers)
import { ingestCoordinator } from "./bootstrap/ingest-coordinator"
import { ingestSource } from "./bootstrap/ingest-source"

// Analysis pipeline
import { analyzeNda, analyzeNdaAfterOcr } from "./analyze-nda"
import { rescoreAnalysis } from "./rescore-analysis"
import { ocrDocument } from "./ocr-document"

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
  // Demo functions
  demoProcess,
  demoMultiStep,

  // Bootstrap functions (coordinator + source workers)
  ingestCoordinator,
  ingestSource,

  // Analysis pipeline
  analyzeNda,
  analyzeNdaAfterOcr,
  rescoreAnalysis,
  ocrDocument,

  // Production functions - TBD
  // processDocument,
  // compareNdas,
  // generateNda,
  // generateEmbeddings,
]
