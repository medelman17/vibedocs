"use client"

import { useCallback, useState } from "react"

interface Paragraph {
  text: string
  style: string
  isHeading: boolean
}

interface DocumentContent {
  fullText: string
  paragraphs: Paragraph[]
  title: string
}

interface UseDocumentContentReturn {
  extractContent: () => Promise<DocumentContent>
  isExtracting: boolean
  error: Error | null
}

/**
 * Hook to extract content from the current Word document.
 * Uses the Office.js Word API to get text and paragraph structure.
 */
export function useDocumentContent(): UseDocumentContentReturn {
  const [isExtracting, setIsExtracting] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const extractContent = useCallback(async (): Promise<DocumentContent> => {
    setIsExtracting(true)
    setError(null)

    try {
      const content = await Word.run(async (context) => {
        const body = context.document.body
        const paragraphs = body.paragraphs
        const properties = context.document.properties

        // Load document properties for title
        properties.load("title")
        body.load("text")
        paragraphs.load("items")
        await context.sync()

        // Load each paragraph's details
        const structuredParagraphs: Paragraph[] = []
        for (const para of paragraphs.items) {
          para.load("text, style")
        }
        await context.sync()

        for (const para of paragraphs.items) {
          structuredParagraphs.push({
            text: para.text,
            style: para.style || "Normal",
            isHeading: para.style?.startsWith("Heading") ?? false,
          })
        }

        return {
          fullText: body.text,
          paragraphs: structuredParagraphs,
          title: properties.title || "Untitled Document",
        }
      })

      setIsExtracting(false)
      return content
    } catch (err) {
      const error =
        err instanceof Error ? err : new Error("Failed to extract document content")
      setError(error)
      setIsExtracting(false)
      throw error
    }
  }, [])

  return { extractContent, isExtracting, error }
}
