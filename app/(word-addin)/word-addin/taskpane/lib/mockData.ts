/**
 * Mock data for demoing the Word Add-in UI
 *
 * Realistic NDA analysis results for visual testing.
 */

import type { AnalysisResults } from "../store/analysis"

export const MOCK_ANALYSIS_RESULTS: AnalysisResults = {
  analysisId: "mock-analysis-001",
  documentId: "mock-doc-001",
  status: "completed",
  version: 1,
  overallRiskScore: 62,
  overallRiskLevel: "cautious",
  summary:
    "This NDA contains standard confidentiality provisions but has several clauses that favor the disclosing party. The non-compete and non-solicitation terms are broader than typical, and the indemnification clause lacks mutual protection. Recommend negotiating the term length and adding carve-outs for publicly available information.",
  clauses: [
    {
      id: "clause-001",
      category: "confidentiality_definition",
      clauseText:
        '"Confidential Information" means any and all information or data, whether oral, written, electronic, or visual, that is disclosed by the Disclosing Party to the Receiving Party, including but not limited to trade secrets, business plans, customer lists, financial information, technical data, software, inventions, processes, and any other proprietary information.',
      confidence: 0.95,
      riskLevel: "standard",
      riskExplanation:
        "Standard definition of confidential information with appropriate breadth. Includes typical categories of protected information.",
      startPosition: 1250,
      endPosition: 1680,
    },
    {
      id: "clause-002",
      category: "non_compete",
      clauseText:
        "During the term of this Agreement and for a period of three (3) years thereafter, the Receiving Party shall not, directly or indirectly, engage in any business that competes with the Disclosing Party's business anywhere in North America.",
      confidence: 0.91,
      riskLevel: "aggressive",
      riskExplanation:
        "Three-year post-termination non-compete with broad geographic scope (all of North America) is unusually restrictive. Standard NDAs typically have 1-year terms with limited geographic restrictions.",
      startPosition: 2100,
      endPosition: 2450,
    },
    {
      id: "clause-003",
      category: "term_duration",
      clauseText:
        "This Agreement shall remain in effect for a period of five (5) years from the Effective Date, unless earlier terminated in accordance with Section 8.",
      confidence: 0.98,
      riskLevel: "cautious",
      riskExplanation:
        "Five-year term is longer than the typical 2-3 year NDA term. Consider negotiating for a shorter duration or automatic renewal provisions.",
      startPosition: 850,
      endPosition: 1050,
    },
    {
      id: "clause-004",
      category: "indemnification",
      clauseText:
        "The Receiving Party agrees to indemnify, defend, and hold harmless the Disclosing Party from and against any and all claims, damages, losses, costs, and expenses (including reasonable attorneys' fees) arising out of or resulting from any breach of this Agreement by the Receiving Party.",
      confidence: 0.89,
      riskLevel: "aggressive",
      riskExplanation:
        "One-sided indemnification clause favoring only the Disclosing Party. Best practice is mutual indemnification for respective breaches.",
      startPosition: 4200,
      endPosition: 4580,
    },
    {
      id: "clause-005",
      category: "return_of_materials",
      clauseText:
        "Upon termination or expiration of this Agreement, or upon written request by the Disclosing Party, the Receiving Party shall promptly return or destroy all Confidential Information and any copies thereof, and shall certify in writing that such return or destruction has been completed.",
      confidence: 0.94,
      riskLevel: "standard",
      riskExplanation:
        "Standard return/destruction clause with certification requirement. Appropriately protects the Disclosing Party's interests.",
      startPosition: 5100,
      endPosition: 5480,
    },
    {
      id: "clause-006",
      category: "non_solicitation",
      clauseText:
        "For a period of two (2) years following the termination of this Agreement, neither party shall solicit for employment any employee of the other party who was involved in the exchange of Confidential Information.",
      confidence: 0.87,
      riskLevel: "cautious",
      riskExplanation:
        "Two-year non-solicitation is reasonable but limited to employees involved in information exchange. Consider whether this scope is appropriate for your situation.",
      startPosition: 3500,
      endPosition: 3820,
    },
    {
      id: "clause-007",
      category: "permitted_disclosure",
      clauseText:
        "Notwithstanding the foregoing, the Receiving Party may disclose Confidential Information to the extent required by law, regulation, or court order, provided that the Receiving Party gives the Disclosing Party prompt written notice of such requirement prior to disclosure.",
      confidence: 0.92,
      riskLevel: "standard",
      riskExplanation:
        "Standard legal compulsion exception with notice requirement. Appropriately balances legal compliance with protection of confidential information.",
      startPosition: 2800,
      endPosition: 3150,
    },
    {
      id: "clause-008",
      category: "governing_law",
      clauseText:
        "This Agreement shall be governed by and construed in accordance with the laws of the State of Delaware, without regard to its conflicts of law principles.",
      confidence: 0.96,
      riskLevel: "standard",
      riskExplanation:
        "Delaware law is commonly chosen for commercial agreements due to its well-developed body of business law. Standard choice of law provision.",
      startPosition: 6200,
      endPosition: 6420,
    },
    {
      id: "clause-009",
      category: "injunctive_relief",
      clauseText:
        "The parties acknowledge that any breach of this Agreement may cause irreparable harm to the Disclosing Party for which monetary damages would be inadequate. Accordingly, the Disclosing Party shall be entitled to seek injunctive relief without the necessity of proving actual damages or posting any bond.",
      confidence: 0.88,
      riskLevel: "cautious",
      riskExplanation:
        'Waiver of bond requirement for injunctive relief is one-sided. The "without proving actual damages" language is standard, but consider negotiating mutual injunctive relief rights.',
      startPosition: 5800,
      endPosition: 6150,
    },
    {
      id: "clause-010",
      category: "assignment",
      clauseText:
        "Neither party may assign or transfer this Agreement or any rights or obligations hereunder without the prior written consent of the other party, except that either party may assign this Agreement to an affiliate or in connection with a merger, acquisition, or sale of substantially all of its assets.",
      confidence: 0.93,
      riskLevel: "standard",
      riskExplanation:
        "Standard assignment clause with appropriate exceptions for corporate transactions. Protects both parties while allowing flexibility for business changes.",
      startPosition: 6500,
      endPosition: 6880,
    },
  ],
  gapAnalysis: {
    missingClauses: [
      "residual_knowledge",
      "publicity_restrictions",
      "data_protection",
    ],
    weakClauses: [
      {
        category: "indemnification",
        reason:
          "Indemnification is one-sided, only protecting the Disclosing Party. Consider negotiating for mutual indemnification.",
      },
      {
        category: "injunctive_relief",
        reason:
          "Bond waiver provision only benefits the Disclosing Party. Mutual provisions would be more balanced.",
      },
    ],
    recommendations: [
      {
        category: "non_compete",
        recommendation:
          "Negotiate to reduce the non-compete period from 3 years to 1 year and limit geographic scope to specific markets where you actually compete.",
        priority: "high",
      },
      {
        category: "term_duration",
        recommendation:
          "Request reduction of the agreement term from 5 years to 2-3 years, or add automatic renewal provisions with termination rights.",
        priority: "medium",
      },
      {
        category: "indemnification",
        recommendation:
          "Propose mutual indemnification language where each party indemnifies the other for their respective breaches.",
        priority: "high",
      },
      {
        category: "residual_knowledge",
        recommendation:
          'Add a residual knowledge clause permitting use of general skills and knowledge retained in unaided memory ("residuals clause").',
        priority: "medium",
      },
      {
        category: "data_protection",
        recommendation:
          "Include data protection provisions addressing GDPR/CCPA compliance if personal data may be shared.",
        priority: "low",
      },
    ],
  },
  tokenUsage: {
    input: 45230,
    output: 12450,
    total: 57680,
  },
  processingTimeMs: 34500,
  completedAt: new Date().toISOString(),
}

/**
 * Alternative mock data with lower risk score
 */
export const MOCK_ANALYSIS_LOW_RISK: AnalysisResults = {
  ...MOCK_ANALYSIS_RESULTS,
  analysisId: "mock-analysis-002",
  overallRiskScore: 28,
  overallRiskLevel: "standard",
  summary:
    "This NDA contains well-balanced terms that protect both parties fairly. The confidentiality provisions are clear and appropriately scoped, and the mutual obligations create a fair framework for information sharing.",
  clauses: MOCK_ANALYSIS_RESULTS.clauses.map((clause) => ({
    ...clause,
    riskLevel:
      clause.riskLevel === "aggressive"
        ? "cautious"
        : clause.riskLevel === "cautious"
          ? "standard"
          : clause.riskLevel,
  })) as AnalysisResults["clauses"],
  gapAnalysis: {
    missingClauses: [],
    weakClauses: [],
    recommendations: [
      {
        category: "term_duration",
        recommendation:
          "Consider adding automatic renewal provisions for ongoing business relationships.",
        priority: "low",
      },
    ],
  },
}

/**
 * Alternative mock data with high risk score
 */
export const MOCK_ANALYSIS_HIGH_RISK: AnalysisResults = {
  ...MOCK_ANALYSIS_RESULTS,
  analysisId: "mock-analysis-003",
  overallRiskScore: 78,
  overallRiskLevel: "aggressive",
  summary:
    "This NDA contains multiple one-sided provisions that significantly favor the Disclosing Party. The broad non-compete, lengthy term, and lack of mutual protections create substantial risk. Strongly recommend significant negotiation before signing.",
  clauses: MOCK_ANALYSIS_RESULTS.clauses.map((clause) => ({
    ...clause,
    riskLevel:
      clause.riskLevel === "standard"
        ? "cautious"
        : clause.riskLevel === "cautious"
          ? "aggressive"
          : clause.riskLevel,
  })) as AnalysisResults["clauses"],
  gapAnalysis: {
    missingClauses: [
      "residual_knowledge",
      "publicity_restrictions",
      "data_protection",
      "limitation_of_liability",
      "mutual_confidentiality",
    ],
    weakClauses: [
      ...MOCK_ANALYSIS_RESULTS.gapAnalysis!.weakClauses,
      {
        category: "non_compete",
        reason:
          "Extremely broad geographic and temporal scope could significantly limit future business opportunities.",
      },
      {
        category: "term_duration",
        reason:
          "Five-year term with no early termination provisions is unusually long for an NDA.",
      },
    ],
    recommendations: [
      ...MOCK_ANALYSIS_RESULTS.gapAnalysis!.recommendations.map((rec) => ({
        ...rec,
        priority: "high" as const,
      })),
    ],
  },
}
