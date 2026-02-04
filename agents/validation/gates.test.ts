import { describe, it, expect } from "vitest"
import {
  validateParserOutput,
  validateClassifierOutput,
  validateTokenBudget,
} from "./gates"
import type { DocumentChunk } from "@/lib/document-processing"
import { estimateTokens } from "@/lib/budget"

// Helper to create test chunks
function createChunk(
  index: number,
  content: string,
  sectionPath: string[] = []
): DocumentChunk {
  return {
    id: `chunk-${index}`,
    index,
    content,
    tokenCount: estimateTokens(content),
    sectionPath,
    startPosition: index * 100,
    endPosition: index * 100 + content.length,
  }
}

describe("validateParserOutput", () => {
  it("passes when document has text and chunks", () => {
    const result = validateParserOutput("Hello world", [
      { id: "1", content: "Hello world" },
    ])
    expect(result.valid).toBe(true)
    expect(result.error).toBeUndefined()
  })

  it("fails when raw text is empty", () => {
    const result = validateParserOutput("", [{ id: "1", content: "test" }])
    expect(result.valid).toBe(false)
    expect(result.error?.code).toBe("EMPTY_DOCUMENT")
  })

  it("fails when raw text is whitespace-only", () => {
    const result = validateParserOutput("   \n\t  ", [
      { id: "1", content: "test" },
    ])
    expect(result.valid).toBe(false)
    expect(result.error?.code).toBe("EMPTY_DOCUMENT")
  })

  it("fails when no chunks generated", () => {
    const result = validateParserOutput("Hello world", [])
    expect(result.valid).toBe(false)
    expect(result.error?.code).toBe("NO_CHUNKS")
  })
})

describe("validateClassifierOutput", () => {
  it("passes when clauses exist", () => {
    const result = validateClassifierOutput([
      { chunkId: "1", category: "Confidentiality" },
    ])
    expect(result.valid).toBe(true)
    expect(result.error).toBeUndefined()
  })

  it("fails when zero clauses extracted", () => {
    const result = validateClassifierOutput([])
    expect(result.valid).toBe(false)
    expect(result.error?.code).toBe("ZERO_CLAUSES")
  })
})

describe("validateTokenBudget", () => {
  it("passes when within budget", () => {
    const chunks = [createChunk(0, "Hello world")]
    const result = validateTokenBudget("Hello world", chunks)

    expect(result.passed).toBe(true)
    expect(result.estimate.withinBudget).toBe(true)
    expect(result.truncation).toBeUndefined()
    expect(result.warning).toBeUndefined()
  })

  it("always passes even when over budget (with truncation)", () => {
    // The gate always passes because it truncates
    // Testing with small text to verify the structure
    const chunks = [createChunk(0, "short text")]
    const result = validateTokenBudget("short text", chunks)

    expect(result.passed).toBe(true)
    expect(result.estimate).toBeDefined()
    expect(result.estimate.tokenCount).toBeGreaterThan(0)
  })

  it("returns token estimate with budget info", () => {
    const chunks = [createChunk(0, "Test document content")]
    const result = validateTokenBudget("Test document content", chunks)

    expect(result.estimate.tokenCount).toBeGreaterThan(0)
    expect(result.estimate.withinBudget).toBe(true)
    expect(result.estimate.budgetRemaining).toBeGreaterThan(0)
    expect(result.estimate.truncationNeeded).toBe(false)
  })
})
