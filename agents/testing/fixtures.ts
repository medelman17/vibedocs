import type { ClassificationResult, RiskAssessment, HypothesisCoverage } from '../types'

// ============================================================================
// Sample Clause Text
// ============================================================================

export const SAMPLE_GOVERNING_LAW_CLAUSE =
  'This Agreement shall be governed by and construed in accordance with ' +
  'the laws of the State of Delaware, without regard to its conflict of law provisions.'

export const SAMPLE_NON_COMPETE_CLAUSE =
  'During the term of this Agreement and for a period of five (5) years thereafter, ' +
  'the Receiving Party shall not, directly or indirectly, engage in any business ' +
  'that competes with the Disclosing Party anywhere in the world.'

export const SAMPLE_CONFIDENTIALITY_CLAUSE =
  'The Receiving Party agrees to hold all Confidential Information in strict confidence ' +
  'and not to disclose such information to any third party without prior written consent.'

// ============================================================================
// Sample Agent Outputs
// ============================================================================

export const SAMPLE_CLASSIFICATION: Omit<ClassificationResult, 'clauseId'> = {
  category: 'Governing Law',
  secondaryCategories: [],
  confidence: 0.95,
  reasoning: 'Explicit governing law designation specifying Delaware jurisdiction.',
}

export const SAMPLE_RISK_ASSESSMENT: Omit<RiskAssessment, 'clauseId'> = {
  riskLevel: 'standard',
  confidence: 0.9,
  explanation: 'Delaware law is commonly used in commercial agreements and represents a neutral, well-established jurisdiction.',
  evidence: {
    citations: ['governed by and construed in accordance with the laws of the State of Delaware'],
    comparisons: ['Matches 78% of CUAD governing law clauses in structure and jurisdiction choice'],
    statistic: 'Delaware is specified in 34% of commercial NDAs, making it the most common jurisdiction.',
  },
}

export const SAMPLE_AGGRESSIVE_RISK: Omit<RiskAssessment, 'clauseId'> = {
  riskLevel: 'aggressive',
  confidence: 0.85,
  explanation: 'Five-year worldwide non-compete significantly exceeds market standard and may be unenforceable.',
  evidence: {
    citations: ['five (5) years thereafter', 'anywhere in the world'],
    comparisons: ['Exceeds 92% of CUAD non-compete clauses in duration', 'Worldwide scope is unusual; most limit to specific regions'],
    statistic: 'Average non-compete duration in NDAs is 2.1 years; 5 years is in the 95th percentile.',
  },
}

export const SAMPLE_HYPOTHESIS_COVERAGE: HypothesisCoverage = {
  hypothesisId: 'nli-7',
  category: 'Public Information Exception',
  status: 'not_mentioned',
  explanation: 'The NDA does not explicitly exclude publicly available information from confidentiality obligations.',
}

// ============================================================================
// Sample Reference Results
// ============================================================================

export const SAMPLE_VECTOR_RESULTS = [
  {
    content: 'This Agreement shall be governed by the laws of the State of New York.',
    category: 'Governing Law',
    similarity: 0.92,
  },
  {
    content: 'The validity and interpretation of this Agreement shall be governed by Delaware law.',
    category: 'Governing Law',
    similarity: 0.89,
  },
  {
    content: 'This Agreement is governed by California law without regard to conflict of laws principles.',
    category: 'Governing Law',
    similarity: 0.85,
  },
]
