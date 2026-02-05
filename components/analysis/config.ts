/**
 * Shared configuration objects for analysis UI components.
 *
 * These configs define colors and labels for risk levels, gap severity,
 * gap statuses, and reference sources. Shared across tab components and
 * the document renderer (for clause highlight colors).
 */

import type * as React from "react"
import {
  CheckCircleIcon,
  AlertTriangleIcon,
  AlertCircleIcon,
  HelpCircleIcon,
} from "lucide-react"
import type {
  GapSeverity,
  EnhancedGapStatus,
} from "@/agents/types"

export type RiskLevel = "standard" | "cautious" | "aggressive" | "unknown"

export const riskConfig: Record<
  RiskLevel,
  {
    label: string
    bgColor: string
    textColor: string
    borderColor: string
    icon: React.ElementType
    description: string
  }
> = {
  standard: {
    label: "Standard",
    bgColor: "oklch(0.90 0.08 175)",
    textColor: "oklch(0.45 0.14 175)",
    borderColor: "oklch(0.85 0.10 175)",
    icon: CheckCircleIcon,
    description: "Within market norms",
  },
  cautious: {
    label: "Cautious",
    bgColor: "oklch(0.90 0.08 65)",
    textColor: "oklch(0.50 0.14 65)",
    borderColor: "oklch(0.85 0.10 65)",
    icon: AlertTriangleIcon,
    description: "Review recommended",
  },
  aggressive: {
    label: "Aggressive",
    bgColor: "oklch(0.90 0.08 25)",
    textColor: "oklch(0.50 0.14 25)",
    borderColor: "oklch(0.85 0.10 25)",
    icon: AlertCircleIcon,
    description: "Negotiation recommended",
  },
  unknown: {
    label: "Unknown",
    bgColor: "oklch(0.92 0.01 280)",
    textColor: "oklch(0.45 0.01 280)",
    borderColor: "oklch(0.88 0.02 280)",
    icon: HelpCircleIcon,
    description: "Could not classify",
  },
}

export const gapSeverityConfig: Record<
  GapSeverity,
  {
    label: string
    bgColor: string
    textColor: string
    borderColor: string
    icon: React.ElementType
  }
> = {
  critical: {
    label: "Critical",
    bgColor: "oklch(0.90 0.08 25)",
    textColor: "oklch(0.50 0.14 25)",
    borderColor: "oklch(0.85 0.10 25)",
    icon: AlertCircleIcon,
  },
  important: {
    label: "Important",
    bgColor: "oklch(0.90 0.08 65)",
    textColor: "oklch(0.50 0.14 65)",
    borderColor: "oklch(0.85 0.10 65)",
    icon: AlertTriangleIcon,
  },
  informational: {
    label: "Info",
    bgColor: "oklch(0.92 0.01 280)",
    textColor: "oklch(0.45 0.01 280)",
    borderColor: "oklch(0.88 0.02 280)",
    icon: HelpCircleIcon,
  },
}

export const gapStatusConfig: Record<
  EnhancedGapStatus,
  {
    label: string
    bgColor: string
    textColor: string
    borderColor: string
  }
> = {
  missing: {
    label: "Missing",
    bgColor: "oklch(0.90 0.08 25)",
    textColor: "oklch(0.50 0.14 25)",
    borderColor: "oklch(0.85 0.10 25)",
  },
  incomplete: {
    label: "Incomplete",
    bgColor: "oklch(0.90 0.08 65)",
    textColor: "oklch(0.50 0.14 65)",
    borderColor: "oklch(0.85 0.10 65)",
  },
}

/** Source label display config: CUAD=blue, ContractNLI=purple, Bonterms=green */
export const sourceConfig: Record<
  string,
  { label: string; bgColor: string; textColor: string; borderColor: string }
> = {
  cuad: {
    label: "CUAD",
    bgColor: "oklch(0.90 0.10 250)",
    textColor: "oklch(0.45 0.15 250)",
    borderColor: "oklch(0.85 0.12 250)",
  },
  contract_nli: {
    label: "ContractNLI",
    bgColor: "oklch(0.90 0.10 300)",
    textColor: "oklch(0.45 0.15 300)",
    borderColor: "oklch(0.85 0.12 300)",
  },
  bonterms: {
    label: "Bonterms",
    bgColor: "oklch(0.90 0.10 150)",
    textColor: "oklch(0.45 0.15 150)",
    borderColor: "oklch(0.85 0.12 150)",
  },
  commonaccord: {
    label: "CommonAccord",
    bgColor: "oklch(0.90 0.10 150)",
    textColor: "oklch(0.45 0.15 150)",
    borderColor: "oklch(0.85 0.12 150)",
  },
}
