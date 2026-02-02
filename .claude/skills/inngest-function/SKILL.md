---
name: inngest-function
description: Create Inngest durable workflow functions following project patterns. Use when building background jobs, agent pipelines, or async workflows.
allowed-tools: Read, Write, Bash, Glob, Grep
---

# Inngest Function Skill

Create an Inngest function for: $ARGUMENTS

## Current Context
- Inngest client: !`ls src/inngest/client.ts 2>/dev/null || echo "Not created yet"`
- Existing functions: !`ls src/inngest/functions/*.ts 2>/dev/null | head -10 || echo "None yet"`

## Project Patterns (from CLAUDE.md)

### Core Rules
1. **Wrap agents in `step.run()`** for durability - if function crashes, it resumes from last completed step
2. **Use `step.sleep()`** for rate limiting between API calls
3. **Concurrency limits**: 5 analyses, 3 embedding batches

### Rate Limits to Respect
| Service | Limit |
|---------|-------|
| Voyage AI | 300 RPM |
| Claude | 60 RPM |

## Function Template

```typescript
import { inngest } from "../client";

export const myFunction = inngest.createFunction(
  {
    id: "my-function",
    // Concurrency control
    concurrency: {
      limit: 5,
      key: "event.data.tenantId", // Per-tenant limiting
    },
    // Retry configuration
    retries: 3,
  },
  { event: "app/my-event" },
  async ({ event, step }) => {
    // Step 1: Durable operation (survives crashes)
    const result1 = await step.run("step-name", async () => {
      // Do work here
      return { data: "result" };
    });

    // Rate limit pause between API calls
    await step.sleep("rate-limit-pause", "1s");

    // Step 2: Another durable operation
    const result2 = await step.run("another-step", async () => {
      // Use result1 here
      return processData(result1);
    });

    return { success: true, result: result2 };
  }
);
```

## Agent Pipeline Pattern

For the NDA analysis pipeline (Parser → Classifier → Risk Scorer → Gap Analyst):

```typescript
export const analyzeNda = inngest.createFunction(
  {
    id: "analyze-nda",
    concurrency: { limit: 5, key: "event.data.tenantId" },
  },
  { event: "nda/analyze" },
  async ({ event, step }) => {
    const { documentId, tenantId } = event.data;

    // Each agent wrapped in step.run for durability
    const parsed = await step.run("parser-agent", async () => {
      // LangGraph agent runs here
      return await parserAgent.invoke({ documentId });
    });

    await step.sleep("claude-rate-limit", "1s"); // 60 RPM

    const classified = await step.run("classifier-agent", async () => {
      return await classifierAgent.invoke({ parsed });
    });

    await step.sleep("claude-rate-limit", "1s");

    const risks = await step.run("risk-scorer-agent", async () => {
      return await riskScorerAgent.invoke({ classified });
    });

    await step.sleep("claude-rate-limit", "1s");

    const gaps = await step.run("gap-analyst-agent", async () => {
      return await gapAnalystAgent.invoke({ classified, risks });
    });

    // Store results
    await step.run("save-analysis", async () => {
      await saveAnalysis({ documentId, tenantId, parsed, classified, risks, gaps });
    });

    return { documentId, status: "complete" };
  }
);
```

## Embedding Batch Pattern

```typescript
export const generateEmbeddings = inngest.createFunction(
  {
    id: "generate-embeddings",
    concurrency: { limit: 3 }, // 3 embedding batches max
  },
  { event: "embeddings/generate" },
  async ({ event, step }) => {
    const { chunks } = event.data;

    // Process in batches with rate limiting
    const results = [];
    for (let i = 0; i < chunks.length; i += 10) {
      const batch = chunks.slice(i, i + 10);

      const embeddings = await step.run(`embed-batch-${i}`, async () => {
        return await voyageEmbed(batch); // voyage-law-2
      });

      results.push(...embeddings);

      // Voyage: 300 RPM, so 200ms between batches is safe
      if (i + 10 < chunks.length) {
        await step.sleep("voyage-rate-limit", "200ms");
      }
    }

    return { embeddings: results };
  }
);
```

## File Structure

Place functions in `src/inngest/functions/`:
```
src/inngest/
├── client.ts           # Inngest client instance
└── functions/
    ├── index.ts        # Export all functions
    ├── analyze-nda.ts  # NDA analysis pipeline
    └── embeddings.ts   # Embedding generation
```

## Workflow

1. Create function file in `src/inngest/functions/`
2. Export from `src/inngest/functions/index.ts`
3. Register with Inngest serve handler in API route
