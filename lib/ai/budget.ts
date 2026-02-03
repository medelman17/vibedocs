/** Token budget per document (from PRD) */
export const DOCUMENT_TOKEN_BUDGET = 212_000

/** Per-agent budget allocation */
export const AGENT_BUDGETS = {
  parser: 20_000,
  classifier: 60_000,
  riskScorer: 80_000,
  gapAnalyst: 52_000,
} as const

/** Pricing per 1M tokens (Sonnet 4.5 rates) */
export const PRICING = {
  input: 3.00,
  output: 15.00,
} as const

export interface TokenUsage {
  input: number
  output: number
  total: number
  estimatedCost: number
}

export interface AggregatedUsage {
  byAgent: Record<string, TokenUsage>
  total: TokenUsage
}

/** Budget tracker for a document analysis run */
export class BudgetTracker {
  private usage: Map<string, TokenUsage> = new Map()

  constructor(private maxTokens: number = DOCUMENT_TOKEN_BUDGET) {}

  /** Record usage from an agent call */
  record(agent: string, input: number, output: number): void {
    const existing = this.usage.get(agent) ?? { input: 0, output: 0, total: 0, estimatedCost: 0 }
    const cost = this.calculateCost(input, output)

    this.usage.set(agent, {
      input: existing.input + input,
      output: existing.output + output,
      total: existing.total + input + output,
      estimatedCost: existing.estimatedCost + cost,
    })
  }

  /** Get total tokens used */
  get totalTokens(): number {
    return Array.from(this.usage.values()).reduce((sum, u) => sum + u.total, 0)
  }

  /** Get remaining budget */
  get remaining(): number {
    return Math.max(0, this.maxTokens - this.totalTokens)
  }

  /** Check if budget exceeded */
  get isExceeded(): boolean {
    return this.totalTokens >= this.maxTokens
  }

  /** Check if approaching budget (80% threshold) */
  get isWarning(): boolean {
    return this.totalTokens >= this.maxTokens * 0.8
  }

  /** Get aggregated usage report */
  getUsage(): AggregatedUsage {
    const byAgent = Object.fromEntries(this.usage)
    const total = {
      input: Array.from(this.usage.values()).reduce((sum, u) => sum + u.input, 0),
      output: Array.from(this.usage.values()).reduce((sum, u) => sum + u.output, 0),
      total: this.totalTokens,
      estimatedCost: Array.from(this.usage.values()).reduce((sum, u) => sum + u.estimatedCost, 0),
    }
    return { byAgent, total }
  }

  private calculateCost(input: number, output: number): number {
    const inputCost = (input / 1_000_000) * PRICING.input
    const outputCost = (output / 1_000_000) * PRICING.output
    return Math.round((inputCost + outputCost) * 10000) / 10000
  }
}
