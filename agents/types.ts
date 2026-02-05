import { z } from 'zod'

// ============================================================================
// Risk Levels (PRD-aligned)
// ============================================================================

/** Risk levels per PRD (not low/medium/high) */
export const RISK_LEVELS = [
  'standard',
  'cautious',
  'aggressive',
  'unknown',
] as const

export type RiskLevel = (typeof RISK_LEVELS)[number]

export const riskLevelSchema = z.enum(RISK_LEVELS)

/** Gap status for clause coverage */
export const GAP_STATUS = [
  'present',
  'weak',
  'missing',
] as const

export type GapStatus = (typeof GAP_STATUS)[number]

// ============================================================================
// CUAD Categories
// ============================================================================

/** CUAD 41-category taxonomy (title case for abbreviations per CLAUDE.md) */
export const CUAD_CATEGORIES = [
  'Document Name',
  'Parties',
  'Agreement Date',
  'Effective Date',
  'Expiration Date',
  'Renewal Term',
  'Notice Period To Terminate Renewal',
  'Governing Law',
  'Most Favored Nation',
  'Non-Compete',
  'Exclusivity',
  'No-Solicit Of Customers',
  'Competitive Restriction Exception',
  'No-Solicit Of Employees',
  'Non-Disparagement',
  'Termination For Convenience',
  'Rofr/Rofo/Rofn',
  'Change Of Control',
  'Anti-Assignment',
  'Revenue/Profit Sharing',
  'Price Restrictions',
  'Minimum Commitment',
  'Volume Restriction',
  'Ip Ownership Assignment',
  'Joint Ip Ownership',
  'License Grant',
  'Non-Transferable License',
  'Affiliate License',
  'Unlimited/All-You-Can-Eat-License',
  'Irrevocable Or Perpetual License',
  'Source Code Escrow',
  'Post-Termination Services',
  'Audit Rights',
  'Uncapped Liability',
  'Cap On Liability',
  'Liquidated Damages',
  'Warranty Duration',
  'Insurance',
  'Covenant Not To Sue',
  'Third Party Beneficiary',
  'Unknown',
] as const

export type CuadCategory = (typeof CUAD_CATEGORIES)[number]

export const cuadCategorySchema = z.enum(CUAD_CATEGORIES)

// ============================================================================
// ContractNLI Categories
// ============================================================================

/** ContractNLI 17 hypothesis categories */
export const CONTRACT_NLI_CATEGORIES = [
  'Purpose Limitation',
  'Permitted Disclosure',
  'Third Party Disclosure',
  'Standard of Care',
  'Survival Period',
  'Termination',
  'Return/Destruction',
  'Ip License',
  'Warranties',
  'Liability Limitation',
  'Governing Law',
  'Legal Compulsion',
  'Public Information Exception',
  'Prior Knowledge Exception',
  'Independent Development Exception',
  'Assignment',
  'Amendment',
] as const

export type ContractNLICategory = (typeof CONTRACT_NLI_CATEGORIES)[number]

// ============================================================================
// Agent Output Types
// ============================================================================

/** Classification result from Classifier agent */
export interface ClassificationResult {
  clauseId: string
  category: CuadCategory
  secondaryCategories: CuadCategory[]
  confidence: number
  reasoning: string
}

export const classificationSchema = z.object({
  category: cuadCategorySchema,
  secondaryCategories: z.array(cuadCategorySchema).max(2).default([]),
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
})

/** Risk assessment from Risk Scorer agent (original schema, used by tests and gap analyst) */
export interface RiskAssessment {
  clauseId: string
  /** PRD risk levels: standard | cautious | aggressive | unknown */
  riskLevel: RiskLevel
  confidence: number
  explanation: string
  evidence: {
    citations: string[]
    comparisons: string[]
    statistic?: string
  }
}

export const riskAssessmentSchema = z.object({
  riskLevel: riskLevelSchema,
  confidence: z.number().min(0).max(1),
  explanation: z.string(),
  evidence: z.object({
    citations: z.array(z.string()).min(1),
    comparisons: z.array(z.string()).min(1),
    statistic: z.string().optional(),
  }),
})

// ============================================================================
// Perspective (Phase 7 - Risk Scoring)
// ============================================================================

/** Assessment perspective for risk scoring */
export const PERSPECTIVES = ['receiving', 'disclosing', 'balanced'] as const
export type Perspective = (typeof PERSPECTIVES)[number]
export const perspectiveSchema = z.enum(PERSPECTIVES)

// ============================================================================
// Enhanced Risk Assessment (Phase 7 - Risk Scoring)
// ============================================================================

/**
 * Enhanced risk assessment schema for the risk scorer LLM call.
 *
 * Adds structured citations, perspective-aware scoring, atypical language
 * detection, and negotiation suggestions over the original riskAssessmentSchema.
 */
export const enhancedRiskAssessmentSchema = z.object({
  riskLevel: riskLevelSchema,
  confidence: z.number().min(0).max(1),
  explanation: z
    .string()
    .max(500)
    .describe('Risk-first plain-language explanation (2-3 sentences)'),
  negotiationSuggestion: z
    .string()
    .max(200)
    .optional()
    .describe('Concrete negotiation suggestion for non-standard clauses'),
  atypicalLanguage: z
    .boolean()
    .describe(
      'True if wording is unusual even when substance is standard'
    ),
  atypicalLanguageNote: z
    .string()
    .max(200)
    .optional()
    .describe('Note about unusual wording'),
  evidence: z.object({
    citations: z
      .array(
        z.object({
          text: z
            .string()
            .max(300)
            .describe('Quoted text from the clause'),
          sourceType: z.enum(['clause', 'reference', 'template']),
        })
      )
      .min(1)
      .max(5),
    references: z
      .array(
        z.object({
          sourceId: z.string().describe('ID from reference corpus'),
          source: z.enum([
            'cuad',
            'contract_nli',
            'bonterms',
            'commonaccord',
          ]),
          section: z.string().optional(),
          similarity: z.number().min(0).max(1),
          summary: z
            .string()
            .max(200)
            .describe('Brief summary of the reference'),
        })
      )
      .max(5),
    baselineComparison: z
      .string()
      .max(300)
      .optional()
      .describe(
        'Comparison to Bonterms/standard baseline when template match available'
      ),
  }),
})

export type EnhancedRiskAssessment = z.infer<
  typeof enhancedRiskAssessmentSchema
>

/** Hypothesis coverage from Gap Analyst */
export interface HypothesisCoverage {
  hypothesisId: string
  category: ContractNLICategory
  status: 'entailment' | 'contradiction' | 'not_mentioned'
  supportingClause?: string
  explanation: string
}

export const hypothesisCoverageSchema = z.object({
  hypothesisId: z.string(),
  category: z.enum(CONTRACT_NLI_CATEGORIES),
  status: z.enum(['entailment', 'contradiction', 'not_mentioned']),
  supportingClause: z.string().optional(),
  explanation: z.string(),
})

/** Gap analysis result */
export interface GapAnalysis {
  presentCategories: CuadCategory[]
  missingCategories: Array<{
    category: CuadCategory
    importance: 'critical' | 'important' | 'optional'
    explanation: string
  }>
  weakClauses: Array<{
    clauseId: string
    category: CuadCategory
    issue: string
    recommendation: string
  }>
  hypothesisCoverage: HypothesisCoverage[]
  gapScore: number
}

// ============================================================================
// Multi-Label Classification (Phase 6 - Enhanced CUAD Classification)
// ============================================================================

/** Extended categories including Uncategorized for chunks matching no CUAD category */
export const EXTENDED_CATEGORIES = [...CUAD_CATEGORIES, 'Uncategorized'] as const
export type ExtendedCategory = (typeof EXTENDED_CATEGORIES)[number]
export const extendedCategorySchema = z.enum(
  EXTENDED_CATEGORIES as unknown as [string, ...string[]]
)

/** Single chunk classification result within a batch */
export const chunkClassificationResultSchema = z.object({
  chunkIndex: z.number().describe('Index of the chunk in the batch (0-based)'),
  primary: z.object({
    category: extendedCategorySchema,
    confidence: z.number().min(0).max(1),
    rationale: z.string().max(200).describe('Brief 1-2 sentence explanation'),
  }),
  secondary: z
    .array(
      z.object({
        category: cuadCategorySchema,
        confidence: z.number().min(0).max(1),
      })
    )
    .max(2)
    .default([]),
})

/** Batch classification output from enhanced classifier */
export const multiLabelClassificationSchema = z.object({
  classifications: z.array(chunkClassificationResultSchema),
})

export type ChunkClassificationResult = z.infer<
  typeof chunkClassificationResultSchema
>
export type MultiLabelClassificationOutput = z.infer<
  typeof multiLabelClassificationSchema
>

/** Classification confidence thresholds */
export const CLASSIFICATION_THRESHOLDS = {
  /** Below this, classify as Uncategorized */
  MINIMUM_FLOOR: 0.3,
  /** Below this, flag for review */
  LOW_CONFIDENCE: 0.7,
} as const
