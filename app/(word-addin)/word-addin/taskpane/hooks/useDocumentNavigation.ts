"use client"

import { useCallback, useState } from "react"

interface NavigationResult {
  success: boolean
  error?: string
}

interface UseDocumentNavigationReturn {
  navigateToClause: (
    clauseText: string,
    startPosition?: number | null,
    endPosition?: number | null
  ) => Promise<NavigationResult>
  isNavigating: boolean
  error: Error | null
}

/**
 * Hook to navigate to and highlight clauses in the Word document.
 *
 * Uses the Office.js Word API to search for clause text and select/highlight
 * the matching range in the document, scrolling it into view.
 *
 * @example
 * ```tsx
 * const { navigateToClause, isNavigating, error } = useDocumentNavigation()
 *
 * const handleNavigate = async () => {
 *   const result = await navigateToClause(clause.clauseText)
 *   if (!result.success) {
 *     console.error('Navigation failed:', result.error)
 *   }
 * }
 * ```
 */
export function useDocumentNavigation(): UseDocumentNavigationReturn {
  const [isNavigating, setIsNavigating] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const navigateToClause = useCallback(
    async (
      clauseText: string,
      _startPosition?: number | null,
      _endPosition?: number | null
    ): Promise<NavigationResult> => {
      setIsNavigating(true)
      setError(null)

      try {
        // Validate input
        if (!clauseText || clauseText.trim().length === 0) {
          throw new Error("Clause text is required for navigation")
        }

        // Check if Word API is available
        if (typeof Word === "undefined") {
          throw new Error("Word API is not available")
        }

        const result = await Word.run(async (context) => {
          const body = context.document.body

          // Prepare search text - limit length and clean up for better matching
          // Word search has a character limit, so we may need to truncate
          const searchText = prepareSearchText(clauseText)

          // Search for the clause text
          const searchResults = body.search(searchText, {
            matchCase: false,
            matchWholeWord: false,
          })

          searchResults.load("items")
          await context.sync()

          if (searchResults.items.length === 0) {
            // If exact match fails, try with a shorter prefix
            const shorterText = clauseText.substring(0, 100).trim()
            const fallbackResults = body.search(shorterText, {
              matchCase: false,
              matchWholeWord: false,
            })

            fallbackResults.load("items")
            await context.sync()

            if (fallbackResults.items.length === 0) {
              return {
                success: false,
                error: "Clause text not found in document",
              }
            }

            // Use the first fallback match
            const fallbackMatch = fallbackResults.items[0]
            fallbackMatch.select()
            await context.sync()

            return { success: true }
          }

          // Take the first match and select it (scrolls into view)
          const match = searchResults.items[0]
          match.select()

          await context.sync()

          return { success: true }
        })

        setIsNavigating(false)
        return result
      } catch (err) {
        const errorObj =
          err instanceof Error ? err : new Error("Failed to navigate to clause")
        setError(errorObj)
        setIsNavigating(false)
        return {
          success: false,
          error: errorObj.message,
        }
      }
    },
    []
  )

  return { navigateToClause, isNavigating, error }
}

/**
 * Prepare text for Word search API.
 *
 * Word search has limitations:
 * - Max ~255 characters
 * - Special characters may cause issues
 *
 * This function cleans and truncates text for reliable matching.
 */
function prepareSearchText(text: string): string {
  // Remove leading/trailing whitespace
  let cleaned = text.trim()

  // Collapse multiple whitespace to single spaces
  cleaned = cleaned.replace(/\s+/g, " ")

  // Word search API has a practical limit around 255 characters
  // Use a shorter portion for more reliable matching
  const maxLength = 200
  if (cleaned.length > maxLength) {
    // Try to truncate at a word boundary
    const truncated = cleaned.substring(0, maxLength)
    const lastSpace = truncated.lastIndexOf(" ")
    if (lastSpace > maxLength * 0.7) {
      cleaned = truncated.substring(0, lastSpace)
    } else {
      cleaned = truncated
    }
  }

  return cleaned
}
