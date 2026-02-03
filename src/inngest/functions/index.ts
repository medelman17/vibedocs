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

// Bootstrap pipeline
import { ingestReferenceData } from "./bootstrap/ingest-reference-data"
import { ingestCoordinator } from "./bootstrap/ingest-coordinator"
import { ingestSource } from "./bootstrap/ingest-source"

// Production functions - will be populated as functions are created
// import { processDocument } from "./process-document"
// import { analyzeNda } from "./analyze-nda"
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

  // Bootstrap functions
  ingestReferenceData,
  ingestCoordinator,
  ingestSource,

  // Production functions
  // processDocument,
  // analyzeNda,
  // compareNdas,
  // generateNda,
  // generateEmbeddings,
]
