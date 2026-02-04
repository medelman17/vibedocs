import { describe, it, expect } from 'vitest'
import { estimateTokens, checkTokenBudget } from './estimation'
import { BUDGET_LIMITS } from './limits'

describe('estimateTokens', () => {
  it('returns positive count for non-empty text', () => {
    const count = estimateTokens('Hello, world!')
    expect(count).toBeGreaterThan(0)
  })

  it('returns 0 for empty text', () => {
    expect(estimateTokens('')).toBe(0)
  })

  it('scales approximately with text length', () => {
    const shortText = 'Hello world'
    const longText = 'Hello world '.repeat(100)

    const shortCount = estimateTokens(shortText)
    const longCount = estimateTokens(longText)

    // Long text should have more tokens
    expect(longCount).toBeGreaterThan(shortCount)
    // Roughly 100x more text should result in roughly 100x more tokens
    expect(longCount).toBeGreaterThan(shortCount * 50)
  })
})

describe('checkTokenBudget', () => {
  it('returns withinBudget true for small text', () => {
    const result = checkTokenBudget('Hello', 1000)
    expect(result.withinBudget).toBe(true)
    expect(result.truncationNeeded).toBe(false)
    expect(result.budgetRemaining).toBeGreaterThan(0)
  })

  it('returns truncationNeeded true when over budget', () => {
    const longText = 'word '.repeat(1000) // ~1000 tokens
    const result = checkTokenBudget(longText, 100)

    expect(result.withinBudget).toBe(false)
    expect(result.truncationNeeded).toBe(true)
    expect(result.budgetRemaining).toBe(0)
  })

  it('uses default budget from BUDGET_LIMITS', () => {
    const smallText = 'Hello'
    const result = checkTokenBudget(smallText)

    expect(result.withinBudget).toBe(true)
    expect(result.budgetRemaining).toBeLessThanOrEqual(BUDGET_LIMITS.TOKEN_BUDGET)
    expect(result.budgetRemaining).toBeGreaterThan(0)
  })

  it('calculates correct budgetRemaining', () => {
    const text = 'Hello' // ~1 token
    const budget = 100
    const result = checkTokenBudget(text, budget)

    expect(result.budgetRemaining).toBe(budget - result.tokenCount)
  })

  it('returns 0 budgetRemaining when over budget', () => {
    const longText = 'word '.repeat(500)
    const result = checkTokenBudget(longText, 10)

    expect(result.budgetRemaining).toBe(0)
  })
})
