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

// =============================================================================
// Auth Context Types
// =============================================================================

// Organization roles
export type OrgRole = "owner" | "admin" | "member" | "viewer";

// Server-side tenant context - discriminated union for type safety
// Used by API routes and auth utilities
export type TenantContext =
  | { tenantId: null; role: null }
  | { tenantId: string; role: OrgRole };

// Server-side auth context (verified, non-null user)
// Returned by verifyAddInAuth() after successful authentication
export interface AddInAuthContext {
  userId: string;
  user: {
    id: string;
    email: string;
    name: string | null;
  };
  tenant: TenantContext;
}

// Client-side tenant context for UI state
// Used by stores and components
export type ClientTenantContext =
  | { hasTenant: true; tenantId: string; tenantName: string }
  | { hasTenant: false; tenantId: null; tenantName: null };

// Client-side auth context for UI state
// Used by auth store for tracking authentication state
export interface ClientAuthContext {
  isAuthenticated: boolean;
  userId: string | null;
  userEmail: string | null;
  userName: string | null;
  tenant: ClientTenantContext;
}

// Auth dialog result - discriminated union
export type AuthDialogResult =
  | { success: true; token: string; expiresAt: number }
  | { success: false; error: string };

// Navigation result for click-to-navigate
export type NavigationResult =
  | { success: true; navigated: true }
  | { success: false; error: string };

// =============================================================================
// Badge Configuration Constants
// =============================================================================

/**
 * Badge configuration for risk levels
 * Uses semantic color tokens from the design system
 */
export const RISK_BADGE_CONFIG: Record<
  RiskLevel,
  { label: string; className: string; strokeColor: string }
> = {
  standard: {
    label: "Standard",
    className: "bg-success-50 text-success-600 dark:bg-success-500/20 dark:text-success-400",
    strokeColor: "oklch(var(--success-500))",
  },
  cautious: {
    label: "Cautious",
    className: "bg-warning-50 text-warning-600 dark:bg-warning-500/20 dark:text-warning-400",
    strokeColor: "oklch(var(--warning-500))",
  },
  aggressive: {
    label: "Aggressive",
    className: "bg-error-50 text-error-600 dark:bg-error-500/20 dark:text-error-400",
    strokeColor: "oklch(var(--error-500))",
  },
  unknown: {
    label: "Unknown",
    className: "bg-muted text-muted-foreground",
    strokeColor: "oklch(var(--neutral-400))",
  },
}

/**
 * Priority badge configuration for gap analysis
 */
export const PRIORITY_BADGE_CONFIG: Record<
  "low" | "medium" | "high",
  { label: string; className: string }
> = {
  low: {
    label: "Low",
    className: "bg-success-50 text-success-600 dark:bg-success-500/20 dark:text-success-400",
  },
  medium: {
    label: "Medium",
    className: "bg-warning-50 text-warning-600 dark:bg-warning-500/20 dark:text-warning-400",
  },
  high: {
    label: "High",
    className: "bg-error-50 text-error-600 dark:bg-error-500/20 dark:text-error-400",
  },
}
