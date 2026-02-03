import { gateway } from 'ai'

/** Available models via Vercel AI Gateway */
export const MODELS = {
  fast: 'anthropic/claude-haiku-4.5',
  balanced: 'anthropic/claude-sonnet-4',
  best: 'anthropic/claude-sonnet-4.5',
  premium: 'anthropic/claude-opus-4.5',
} as const

export type ModelTier = keyof typeof MODELS

/** Per-agent model configuration */
export const AGENT_MODELS = {
  parser: MODELS.fast,
  classifier: MODELS.balanced,
  riskScorer: MODELS.best,
  gapAnalyst: MODELS.best,
} as const

export type AgentType = keyof typeof AGENT_MODELS

/** Get model instance for an agent */
export function getAgentModel(agent: AgentType) {
  return gateway(AGENT_MODELS[agent])
}

/** Override model for specific agent (useful for testing/tuning) */
export function getModelOverride(agent: AgentType, tier: ModelTier) {
  return gateway(MODELS[tier])
}

/** Default generation config */
export const GENERATION_CONFIG = {
  temperature: 0,
  maxTokens: 4096,
} as const
