"use client"

import { useState, useMemo, useCallback } from "react"

export interface SearchMatch {
  /** Sequential match index */
  index: number
  /** Character offset in text (start) */
  start: number
  /** Character offset in text (end) */
  end: number
  /** Which paragraph segment contains this match */
  paragraphIndex: number
}

interface UseDocumentSearchReturn {
  query: string
  setQuery: (q: string) => void
  matches: SearchMatch[]
  activeMatchIndex: number
  nextMatch: () => void
  prevMatch: () => void
  totalMatches: number
  activeMatch: SearchMatch | null
}

const MIN_QUERY_LENGTH = 2

/**
 * Determine which paragraph a character offset belongs to.
 * paragraphOffsets is an array of starting character offsets for each paragraph.
 * Returns the index of the last paragraph whose offset is <= the given position.
 */
function findParagraphIndex(
  position: number,
  paragraphOffsets: number[]
): number {
  let lo = 0
  let hi = paragraphOffsets.length - 1
  let result = 0

  while (lo <= hi) {
    const mid = (lo + hi) >>> 1
    if (paragraphOffsets[mid] <= position) {
      result = mid
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }

  return result
}

export function useDocumentSearch(
  text: string,
  paragraphOffsets: number[]
): UseDocumentSearchReturn {
  const [query, setQueryRaw] = useState("")
  const [activeMatchIndex, setActiveMatchIndex] = useState(0)

  // Reset active index when query changes
  const setQuery = useCallback((q: string) => {
    setQueryRaw(q)
    setActiveMatchIndex(0)
  }, [])

  // Compute matches using useMemo (not useEffect + setState)
  const matches = useMemo<SearchMatch[]>(() => {
    if (query.length < MIN_QUERY_LENGTH) return []

    const lowerText = text.toLowerCase()
    const lowerQuery = query.toLowerCase()
    const results: SearchMatch[] = []
    let pos = 0

    while (pos < lowerText.length) {
      const idx = lowerText.indexOf(lowerQuery, pos)
      if (idx === -1) break

      results.push({
        index: results.length,
        start: idx,
        end: idx + lowerQuery.length,
        paragraphIndex: findParagraphIndex(idx, paragraphOffsets),
      })

      // Move past this match (advance by 1 to find overlapping matches)
      pos = idx + 1
    }

    return results
  }, [text, query, paragraphOffsets])

  const totalMatches = matches.length

  const nextMatch = useCallback(() => {
    if (totalMatches === 0) return
    setActiveMatchIndex((prev) => (prev + 1) % totalMatches)
  }, [totalMatches])

  const prevMatch = useCallback(() => {
    if (totalMatches === 0) return
    setActiveMatchIndex((prev) => (prev - 1 + totalMatches) % totalMatches)
  }, [totalMatches])

  const activeMatch = totalMatches > 0 ? matches[activeMatchIndex] ?? null : null

  return {
    query,
    setQuery,
    matches,
    activeMatchIndex,
    nextMatch,
    prevMatch,
    totalMatches,
    activeMatch,
  }
}
