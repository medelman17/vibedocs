/**
 * @fileoverview Sample NDA Documents for Testing
 *
 * Provides built-in sample NDAs for one-click pipeline testing.
 * Each sample covers a different complexity level for comprehensive testing.
 *
 * @module lib/sample-ndas
 */

export interface SampleNDA {
  /** Unique identifier for the sample */
  id: string;
  /** Human-readable title */
  title: string;
  /** Brief description of what this sample covers */
  description: string;
  /** Complexity level */
  complexity: "short" | "standard" | "complex";
  /** Raw NDA text (the actual document content) */
  rawText: string;
  /** Expected approximate number of CUAD clauses */
  expectedClauseCount: number;
  /** Key CUAD categories expected to be found */
  expectedCategories: string[];
}

export { SHORT_NDA } from "./short-nda";
export { STANDARD_NDA } from "./standard-nda";
export { COMPLEX_NDA } from "./complex-nda";

import { SHORT_NDA } from "./short-nda";
import { STANDARD_NDA } from "./standard-nda";
import { COMPLEX_NDA } from "./complex-nda";

/** All sample NDAs for iteration */
export const SAMPLE_NDAS: SampleNDA[] = [
  SHORT_NDA,
  STANDARD_NDA,
  COMPLEX_NDA,
];
