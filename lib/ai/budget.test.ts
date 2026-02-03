import { describe, it, expect, beforeEach } from 'vitest'
import { BudgetTracker, DOCUMENT_TOKEN_BUDGET, AGENT_BUDGETS, PRICING } from './budget'

describe('BudgetTracker', () => {
  let tracker: BudgetTracker

  beforeEach(() => {
    tracker = new BudgetTracker()
  })

  it('starts with zero tokens used', () => {
    expect(tracker.totalTokens).toBe(0)
    expect(tracker.remaining).toBe(DOCUMENT_TOKEN_BUDGET)
    expect(tracker.isExceeded).toBe(false)
    expect(tracker.isWarning).toBe(false)
  })

  it('records usage from an agent call', () => {
    tracker.record('parser', 1000, 500)
    expect(tracker.totalTokens).toBe(1500)
    expect(tracker.remaining).toBe(DOCUMENT_TOKEN_BUDGET - 1500)
  })

  it('accumulates usage for the same agent', () => {
    tracker.record('parser', 1000, 500)
    tracker.record('parser', 2000, 1000)
    expect(tracker.totalTokens).toBe(4500)
  })

  it('tracks usage per agent', () => {
    tracker.record('parser', 1000, 500)
    tracker.record('classifier', 2000, 1000)
    const usage = tracker.getUsage()
    expect(usage.byAgent['parser'].total).toBe(1500)
    expect(usage.byAgent['classifier'].total).toBe(3000)
    expect(usage.total.total).toBe(4500)
  })

  it('warns at 80% budget', () => {
    const warningThreshold = DOCUMENT_TOKEN_BUDGET * 0.8
    tracker.record('test', warningThreshold, 0)
    expect(tracker.isWarning).toBe(true)
    expect(tracker.isExceeded).toBe(false)
  })

  it('marks exceeded at 100% budget', () => {
    tracker.record('test', DOCUMENT_TOKEN_BUDGET, 0)
    expect(tracker.isExceeded).toBe(true)
  })

  it('calculates estimated cost', () => {
    tracker.record('test', 1_000_000, 100_000) // 1M input, 100K output
    const usage = tracker.getUsage()
    // Input: 1M * $3/1M = $3, Output: 100K * $15/1M = $1.50
    expect(usage.total.estimatedCost).toBeCloseTo(4.5, 2)
  })
})

describe('Budget constants', () => {
  it('defines document budget as 212K tokens', () => {
    expect(DOCUMENT_TOKEN_BUDGET).toBe(212_000)
  })

  it('defines per-agent budgets that sum to ~100%', () => {
    const total = Object.values(AGENT_BUDGETS).reduce((a, b) => a + b, 0)
    expect(total).toBe(212_000)
  })

  it('defines pricing for Sonnet 4.5', () => {
    expect(PRICING.input).toBe(3.00)
    expect(PRICING.output).toBe(15.00)
  })
})
