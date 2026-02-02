/**
 * @fileoverview Shared domain types for Word Add-in
 *
 * Centralizes types used across stores, components, and API routes.
 */

// Risk levels aligned with PRD terminology
export type RiskLevel = "standard" | "cautious" | "aggressive" | "unknown";

// Analysis pipeline stages (for SSE progress)
export type AnalysisStage =
  | "pending"
  | "extracting"
  | "parsing"
  | "classifying"
  | "scoring"
  | "analyzing_gaps"
  | "completed"
  | "failed";

// Clause result from analysis
export interface ClauseResult {
  id: string;
  category: string;
  clauseText: string;
  confidence: number;
  riskLevel: RiskLevel;
  riskExplanation: string | null;
  startPosition: number | null;
  endPosition: number | null;
}

// Gap analysis result
export interface GapAnalysisResult {
  missingClauses: string[];
  weakClauses: Array<{
    category: string;
    reason: string;
  }>;
  recommendations: Array<{
    category: string;
    recommendation: string;
    priority: "low" | "medium" | "high";
  }>;
}

// Full analysis results
export interface AnalysisResults {
  analysisId: string;
  documentId: string;
  status: string;
  version: number;
  overallRiskScore: number | null;
  overallRiskLevel: RiskLevel | null;
  summary: string | null;
  clauses: ClauseResult[];
  gapAnalysis: GapAnalysisResult | null;
  tokenUsage: {
    input: number;
    output: number;
    total: number;
  } | null;
  processingTimeMs: number | null;
  completedAt: string | null;
}

// Progress state for SSE updates
export interface ProgressState {
  stage: AnalysisStage;
  percent: number;
  message: string;
}

// Analysis status for UI state
export type AnalysisStatus =
  | "idle"
  | "extracting"
  | "submitting"
  | "analyzing"
  | "completed"
  | "failed";

// Tenant context - discriminated union for type safety
export type TenantContext =
  | { hasTenant: true; tenantId: string; tenantName: string }
  | { hasTenant: false; tenantId: null; tenantName: null };

// Auth context for Word Add-in
export interface AddInAuthContext {
  isAuthenticated: boolean;
  userId: string | null;
  userEmail: string | null;
  userName: string | null;
  tenant: TenantContext;
}

// Auth dialog result - discriminated union
export type AuthDialogResult =
  | { success: true; token: string; expiresAt: number }
  | { success: false; error: string };

// Navigation result for click-to-navigate
export type NavigationResult =
  | { success: true; navigated: true }
  | { success: false; error: string };
