/**
 * @fileoverview Dataset Utilities
 *
 * Helper functions for dataset parsing: content hashing,
 * text normalization, and markdown heading parsing.
 *
 * @module lib/datasets/utils
 */

import { createHash } from "crypto"

/**
 * Generate SHA-256 content hash for deduplication
 */
export function generateContentHash(content: string): string {
  return createHash("sha256").update(content).digest("hex")
}

/**
 * Parse markdown heading to extract level and text
 */
export function parseHeading(line: string): { level: number; text: string } | null {
  const match = line.match(/^(#{1,6})\s+(.+)$/)
  if (!match) return null
  return {
    level: match[1].length,
    text: match[2].trim(),
  }
}

/**
 * Build section path from heading hierarchy
 */
export function buildSectionPath(
  headings: Array<{ level: number; text: string }>,
  currentLevel: number,
  currentText: string
): string[] {
  const path: string[] = []

  // Find ancestors at each level above current
  for (let level = 1; level < currentLevel; level++) {
    const ancestor = [...headings].reverse().find((h) => h.level === level)
    if (ancestor) {
      path.push(ancestor.text)
    }
  }

  path.push(currentText)
  return path
}

/**
 * Normalize NLI choice to lowercase label
 */
export function normalizeNliLabel(
  choice: "Entailment" | "Contradiction" | "NotMentioned"
): "entailment" | "contradiction" | "not_mentioned" {
  const map = {
    Entailment: "entailment",
    Contradiction: "contradiction",
    NotMentioned: "not_mentioned",
  } as const
  return map[choice]
}

/**
 * Clean and normalize text content
 */
export function normalizeText(text: string): string {
  return text
    .replace(/\r\n/g, "\n") // Normalize line endings
    .replace(/\t/g, "  ") // Tabs to spaces
    .trim()
}
