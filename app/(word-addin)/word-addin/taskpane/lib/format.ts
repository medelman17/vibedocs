/**
 * @fileoverview Shared formatting utilities for Word Add-in components
 */

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
