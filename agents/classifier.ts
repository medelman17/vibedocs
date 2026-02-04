/**
 * @fileoverview Classifier Agent
 *
 * Second stage of the NDA analysis pipeline. Classifies document chunks
 * into CUAD 41-category taxonomy with confidence scores.
 *
 * Uses few-shot prompting with similar reference clauses from the
 * CUAD/ContractNLI embedding corpus.
 *
 * @module agents/classifier
 */

import { generateText, Output, NoObjectGeneratedError } from 'ai'
import { getAgentModel } from '@/lib/ai/config'
import { AnalysisFailedError } from '@/lib/errors'
import { classificationSchema, type CuadCategory } from './types'
import { findSimilarClauses } from './tools/vector-search'
import { createClassifierPrompt, CLASSIFIER_SYSTEM_PROMPT } from './prompts'
import type { BudgetTracker } from '@/lib/ai/budget'
import type { DocumentChunk } from '@/lib/document-processing'

// ============================================================================
// Types
// ============================================================================

export interface ParsedChunk extends DocumentChunk {
  embedding: number[]
}

export interface ClassifierInput {
  parsedDocument: {
    documentId: string
    title: string
    rawText: string
    chunks: ParsedChunk[]
  }
  budgetTracker: BudgetTracker
}

export interface ClassifiedClause {
  chunkId: string
  clauseText: string
  category: CuadCategory
  secondaryCategories: CuadCategory[]
  confidence: number
  reasoning: string
  startPosition: number
  endPosition: number
}

export interface ClassifierOutput {
  clauses: ClassifiedClause[]
  tokenUsage: { inputTokens: number; outputTokens: number }
}

// ============================================================================
// Classifier Agent
// ============================================================================

/**
 * Runs the classifier agent to categorize document chunks.
 *
 * For each chunk:
 * 1. Fetches similar reference clauses from vector search
 * 2. Generates classification using Claude with few-shot prompting
 * 3. Preserves position information for Word Add-in integration
 *
 * @param input - Classifier input with parsed document and budget tracker
 * @returns Classified clauses with confidence scores
 */
export async function runClassifierAgent(
  input: ClassifierInput
): Promise<ClassifierOutput> {
  const { parsedDocument, budgetTracker } = input
  const clauses: ClassifiedClause[] = []
  let totalInputTokens = 0
  let totalOutputTokens = 0

  for (const chunk of parsedDocument.chunks) {
    // Fetch similar reference clauses for few-shot prompting
    const references = await findSimilarClauses(chunk.content, { limit: 3 })

    // Build prompt with references
    const prompt = createClassifierPrompt(chunk.content, references)

    // Generate classification
    let result
    try {
      result = await generateText({
        model: getAgentModel('classifier'),
        system: CLASSIFIER_SYSTEM_PROMPT,
        prompt,
        output: Output.object({ schema: classificationSchema }),
      })
    } catch (error) {
      if (NoObjectGeneratedError.isInstance(error)) {
        console.error('[Classifier] Object generation failed', {
          cause: error.cause,
          text: error.text?.slice(0, 500),
          usage: error.usage,
        })
        throw new AnalysisFailedError(
          'Classification failed to produce valid output',
          [{ field: 'chunk', message: `Model output: ${error.text?.slice(0, 100) ?? 'empty'}` }]
        )
      }
      throw error
    }

    const { output, usage } = result

    // Track token usage
    totalInputTokens += usage?.inputTokens ?? 0
    totalOutputTokens += usage?.outputTokens ?? 0

    // Skip low-confidence "Unknown" classifications to reduce noise.
    // Rationale: Low-confidence unknowns indicate the chunk likely contains
    // boilerplate text, definitions, or non-substantive content that doesn't
    // fit the CUAD taxonomy. Including these would clutter the analysis
    // without adding meaningful risk assessment value. High-confidence unknowns
    // (>= 0.5) are kept to flag potentially important uncategorized clauses.
    if (output.category === 'Unknown' && output.confidence < 0.5) {
      continue
    }

    clauses.push({
      chunkId: chunk.id,
      clauseText: chunk.content,
      category: output.category,
      secondaryCategories: output.secondaryCategories,
      confidence: output.confidence,
      reasoning: output.reasoning,
      startPosition: chunk.startPosition,
      endPosition: chunk.endPosition,
    })
  }

  // Record budget
  budgetTracker.record('classifier', totalInputTokens, totalOutputTokens)

  return {
    clauses,
    tokenUsage: { inputTokens: totalInputTokens, outputTokens: totalOutputTokens },
  }
}
