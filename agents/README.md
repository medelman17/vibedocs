# Agents

AI SDK 6 agent definitions for the NDA analysis pipeline.

## Directory Structure

```
agents/
├── prompts/      # System prompts for each agent
├── tools/        # Vector search and other agent tools
├── testing/      # Mock AI and fixtures for agent tests
└── comparison/   # Comparison pipeline schemas and prompts
```

## Pipeline

```
Parser Agent → Classifier Agent → Risk Scorer Agent → Gap Analyst Agent
```

Each agent runs inside an `inngest step.run()` for durability.

## Implementation Status

🚧 **Planned** - See `docs/plans/2026-02-01-inngest-agents-foundation.md`
