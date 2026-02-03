import { describe, it, expect } from 'vitest'
import { MODELS, AGENT_MODELS, getAgentModel, GENERATION_CONFIG } from './config'

describe('AI Configuration', () => {
  it('exports model tiers', () => {
    expect(MODELS.fast).toBe('anthropic/claude-haiku-4.5')
    expect(MODELS.balanced).toBe('anthropic/claude-sonnet-4')
    expect(MODELS.best).toBe('anthropic/claude-sonnet-4.5')
    expect(MODELS.premium).toBe('anthropic/claude-opus-4.5')
  })

  it('exports per-agent model assignments', () => {
    expect(AGENT_MODELS.parser).toBe(MODELS.fast)
    expect(AGENT_MODELS.classifier).toBe(MODELS.balanced)
    expect(AGENT_MODELS.riskScorer).toBe(MODELS.best)
    expect(AGENT_MODELS.gapAnalyst).toBe(MODELS.best)
  })

  it('returns model instance for agent', () => {
    const model = getAgentModel('parser')
    expect(model).toBeDefined()
  })

  it('exports generation config with zero temperature', () => {
    expect(GENERATION_CONFIG.temperature).toBe(0)
    expect(GENERATION_CONFIG.maxTokens).toBe(4096)
  })
})
