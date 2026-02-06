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
    .describe('Risk-first plain-language explanation (2-3 sentences)'),
  negotiationSuggestion: z
    .string()
    .optional()
    .describe('Concrete negotiation suggestion for non-standard clauses'),
  atypicalLanguage: z
    .boolean()
    .describe(
      'True if wording is unusual even when substance is standard'
    ),
  atypicalLanguageNote: z
    .string()
    .optional()
    .describe('Note about unusual wording'),
  evidence: z.object({
    citations: z
      .array(
        z.object({
          text: z
            .string()
            .describe('Quoted text from the clause'),
          sourceType: z.enum(['clause', 'reference', 'template']),
        })
      )
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
            .describe('Brief summary of the reference'),
        })
      )
      .max(5),
    baselineComparison: z
      .string()
      .optional()
      .describe(
        'Comparison to Bonterms/standard baseline when template match available'
      ),
  }),
})

export type EnhancedRiskAssessment = z.infer<
  typeof enhancedRiskAssessmentSchema
>

/** Batched risk assessment output schema — wraps N assessments with clauseId keys */
export const batchedRiskAssessmentOutputSchema = z.object({
  assessments: z
    .array(
      enhancedRiskAssessmentSchema.extend({
        clauseId: z.string().describe('The clauseId from the clause header'),
      })
    )
    .describe('One risk assessment per input clause, in the same order'),
})

export type BatchedRiskAssessmentOutput = z.infer<
  typeof batchedRiskAssessmentOutputSchema
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
// Enhanced Gap Analysis (Phase 8)
// ============================================================================

/** Gap severity levels based on cuadCategories.riskWeight */
export const GAP_SEVERITY = [
  'critical',
  'important',
  'informational',
] as const

export type GapSeverity = (typeof GAP_SEVERITY)[number]

export const gapSeveritySchema = z.enum(GAP_SEVERITY)

/** Two-tier gap status: Missing (absent) vs Incomplete (weak coverage) */
export const ENHANCED_GAP_STATUS = ['missing', 'incomplete'] as const

export type EnhancedGapStatus = (typeof ENHANCED_GAP_STATUS)[number]

export const enhancedGapStatusSchema = z.enum(ENHANCED_GAP_STATUS)

/** Individual gap identified in the analysis */
export const enhancedGapItemSchema = z.object({
  category: cuadCategorySchema,
  status: enhancedGapStatusSchema,
  severity: gapSeveritySchema,
  explanation: z
    .string()
    .describe('Why this gap matters for this NDA'),
  suggestedLanguage: z
    .string()
    .describe('Full clause draft (1-3 paragraphs), insertable'),
  templateSource: z
    .string()
    .optional()
    .describe('e.g., "Bonterms NDA Section 3.2"'),
  styleMatch: z
    .string()
    .optional()
    .describe('How language was adapted to match NDA style'),
})

export type EnhancedGapItem = z.infer<typeof enhancedGapItemSchema>

/** Coverage summary for the gap analysis */
export const coverageSummarySchema = z.object({
  totalCategories: z.number(),
  presentCount: z.number(),
  missingCount: z.number(),
  incompleteCount: z.number(),
  coveragePercent: z.number().min(0).max(100),
})

export type CoverageSummary = z.infer<typeof coverageSummarySchema>

/** Enhanced gap analysis schema for the LLM call */
export const enhancedGapAnalysisSchema = z.object({
  gaps: z.array(enhancedGapItemSchema),
  coverageSummary: coverageSummarySchema,
  presentCategories: z.array(cuadCategorySchema),
  weakClauses: z.array(
    z.object({
      clauseId: z.string(),
      category: cuadCategorySchema,
      issue: z.string(),
      recommendation: z.string(),
    })
  ),
})

export type EnhancedGapAnalysisOutput = z.infer<
  typeof enhancedGapAnalysisSchema
>

/** Full enhanced gap result stored in analyses.gapAnalysis JSONB */
export interface EnhancedGapResult {
  gaps: EnhancedGapItem[]
  coverageSummary: CoverageSummary
  presentCategories: CuadCategory[]
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
  chunkIndex: z
    .number()
    .describe('The document-wide chunk index matching the index shown in the chunk header'),
  primary: z
    .object({
      category: extendedCategorySchema.describe(
        'The single most relevant CUAD category. Use Uncategorized only when no category fits after careful consideration.'
      ),
      confidence: z
        .number()
        .min(0)
        .max(1)
        .describe(
          'Float 0.0-1.0. 0.9+ unambiguous, 0.7-0.9 strong match, 0.5-0.7 moderate, below 0.3 use Uncategorized.'
        ),
      rationale: z
        .string()
        .describe('1-2 sentence explanation of why this category was chosen.'),
    })
    .describe('The single most relevant classification for this chunk'),
  secondary: z
    .array(
      z.object({
        category: cuadCategorySchema.describe('Additional CUAD category for multi-topic chunks'),
        confidence: z
          .number()
          .min(0)
          .max(1)
          .describe('Float 0.0-1.0. Only include if confidence >= 0.3.'),
      })
    )
    .max(2)
    .default([])
    .describe(
      'Up to 2 additional categories only when the chunk clearly spans multiple topics. Empty array if single-category.'
    ),
})

/** Batch classification output from enhanced classifier */
export const multiLabelClassificationSchema = z.object({
  classifications: z
    .array(chunkClassificationResultSchema)
    .describe('One classification per input chunk, in the same order as the input chunks'),
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
