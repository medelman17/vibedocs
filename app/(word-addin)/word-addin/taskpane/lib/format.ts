/**
 * @fileoverview Shared formatting utilities for Word Add-in components
 */

import type { RiskLevel } from "@/types/word-addin"

/**
 * Format a category string to title case.
 * Converts snake_case or kebab-case to "Title Case".
 *
 * @example
 * formatCategory("non_compete") // "Non Compete"
 * formatCategory("ip-assignment") // "Ip Assignment"
 */
export function formatCategory(category: string): string {
  return category
    .split(/[_-]/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ")
}

/**
 * Normalize a risk level string to a typed RiskLevel.
 * Returns "unknown" for unrecognized values.
 *
 * @example
 * normalizeRiskLevel("STANDARD") // "standard"
 * normalizeRiskLevel("invalid") // "unknown"
 */
export function normalizeRiskLevel(level: string): RiskLevel {
  const normalized = level.toLowerCase()
  if (normalized === "standard" || normalized === "cautious" || normalized === "aggressive") {
    return normalized
  }
  return "unknown"
}
