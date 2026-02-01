# Agent Architecture

> Extracted from [PRD §10](./PRD.md#10-agent-architecture). This is the authoritative reference for agent pipeline design, prompt patterns, and token budgets.

## Overview

The analysis pipeline is a sequence of four specialized agents, each responsible for a discrete analytical step. Agents are wrapped in Inngest steps for durability, with LangGraph.js managing agent-internal state and tool orchestration.

---

## Multi-Agent Pipeline

```
┌─────────────┐     ┌──────────────┐     ┌──────────────┐
│  Parser      │────▶│  Classifier  │────▶│  Risk Scorer │
│  Agent       │     │  Agent       │     │  Agent       │
└─────────────┘     └──────────────┘     └──────┬───────┘
                                                 │
                                                 ▼
                                         ┌──────────────┐
                                         │  Gap Analyst  │
                                         │  Agent        │
                                         └──────────────┘
```

---

## Agent Specifications

### Parser Agent

| Property    | Value                                                    |
| ----------- | -------------------------------------------------------- |
| **Input**   | Raw document text                                        |
| **Tools**   | Text chunking, section detection, table extraction       |
| **Output**  | Structured document with identified sections and chunks  |
| **LLM calls** | 1–2 (section boundary detection, table normalization) |

Responsibilities:
- Split raw document into legal sections using structural patterns (`ARTICLE`, `Section`, numbered clauses)
- Detect section boundaries via LLM when structural patterns are ambiguous
- Normalize tables and lists into prose for downstream embedding
- Produce a chunk array with `section_path` metadata for hierarchical retrieval

### Classifier Agent

| Property    | Value                                                                            |
| ----------- | -------------------------------------------------------------------------------- |
| **Input**   | Document chunks + retrieved CUAD examples from shared reference DB               |
| **Tools**   | Vector similarity search (shared reference DB), category validation              |
| **Output**  | Each chunk labeled with CUAD category, confidence score, matched reference clauses |
| **LLM calls** | 1 per chunk (batch where possible using structured output)                    |

Responsibilities:
- For each chunk, query shared reference DB for top-5 similar CUAD clause annotations
- Construct prompt with the chunk text and retrieved examples as few-shot context
- Claude classifies the chunk into CUAD categories with confidence scores (0.0–1.0)
- Handle multi-category clauses: assign primary and secondary labels
- Aggregate chunk-level classifications into document-level clause extraction

### Risk Scorer Agent

| Property    | Value                                                                       |
| ----------- | --------------------------------------------------------------------------- |
| **Input**   | Classified clauses + retrieved ContractNLI evidence + template baselines    |
| **Tools**   | Vector similarity search, statistical comparison                            |
| **Output**  | Per-clause risk level, explanation, cited evidence                          |
| **LLM calls** | 1 per clause with full RAG context                                      |

Responsibilities:
- For each classified clause, retrieve relevant evidence from three sources:
  1. **CUAD distribution data:** Statistical position relative to annotated clauses across 510 contracts
  2. **ContractNLI hypotheses:** Whether specific NDA obligations are entailed, contradicted, or absent
  3. **Template comparison:** Deviation from Bonterms/CommonAccord standard language
- Score each clause: `standard` | `cautious` | `aggressive` | `unknown`
- Generate plain-language explanation (2–3 sentences) with cited evidence
- Compute overall document risk score as weighted average of clause-level scores

### Gap Analyst Agent

| Property    | Value                                                                          |
| ----------- | ------------------------------------------------------------------------------ |
| **Input**   | Set of extracted categories, full CUAD taxonomy, document text                 |
| **Tools**   | Taxonomy lookup, template retrieval                                            |
| **Output**  | List of missing categories with explanations and recommended language          |
| **LLM calls** | 1 (single pass over full taxonomy vs. extracted categories)                 |

Responsibilities:
- Compare extracted CUAD categories against the full 41-category taxonomy
- Identify categories with no matching clause in the document
- For each missing category, explain the typical protection and why its absence matters
- Retrieve recommended language from Bonterms/CommonAccord templates for missing clauses

---

## Inngest-LangGraph Integration Pattern

Each agent is a LangGraph.js graph wrapped inside an Inngest `step.run()` call. Inngest provides durability (retry, resume) at the agent level; LangGraph provides state management and tool routing within each agent.

```typescript
const analyzeNDA = inngest.createFunction(
  { id: "nda-analyze", concurrency: { limit: 5 } },
  { event: "nda/analyze.requested" },
  async ({ event, step }) => {
    const parsed = await step.run("parse-document", async () => {
      return runParserAgent(event.data.documentId);
    });

    const classified = await step.run("classify-clauses", async () => {
      return runClassifierAgent(parsed.chunks);
    });

    const scored = await step.run("score-risks", async () => {
      return runRiskScorerAgent(classified.clauses);
    });

    const gaps = await step.run("analyze-gaps", async () => {
      return runGapAnalystAgent(classified.categories, scored.clauses);
    });

    await step.run("persist-results", async () => {
      return persistAnalysis(event.data.documentId, {
        clauses: scored,
        gaps,
      });
    });
  },
);
```

**Why this pattern?**
- Inngest retries failed steps individually (e.g., if Risk Scorer fails at clause 12, only that step re-runs)
- LangGraph checkpointing within a step is redundant but harmless
- Inter-agent data passes through Inngest's step return values (serialized JSON)
- Concurrency limit of 5 prevents overwhelming Claude's API

### File Locations

```
src/inngest/
├── client.ts                   # Inngest client instance
└── functions/
    ├── bootstrap.ts            # Bootstrap pipeline (reference data)
    ├── analyze.ts              # Analysis pipeline (this spec)
    ├── compare.ts              # Comparison pipeline
    └── generate.ts             # Generation pipeline

src/agents/
├── parser.ts                   # Parser Agent (LangGraph graph)
├── classifier.ts              # Classifier Agent
├── risk-scorer.ts             # Risk Scorer Agent
└── gap-analyst.ts             # Gap Analyst Agent
```

---

## Claude API Configuration

| Parameter         | Value                      | Rationale                                   |
| ----------------- | -------------------------- | ------------------------------------------- |
| Model             | claude-sonnet-4-5-20250929 | Best cost/quality for structured extraction  |
| Max tokens        | 4,096                      | Sufficient for clause-level analysis         |
| Temperature       | 0.0                        | Deterministic for classification tasks       |
| Structured output | JSON with Zod schema       | Type-safe response parsing                   |

---

## Token Budget Per Document

| Agent       | Calls   | Input/call | Output/call | Total            |
| ----------- | ------- | ---------- | ----------- | ---------------- |
| Parser      | 2       | ~8K        | ~2K         | ~20K             |
| Classifier  | ~15     | ~4K        | ~1K         | ~75K             |
| Risk Scorer | ~15     | ~6K        | ~1K         | ~105K            |
| Gap Analyst | 1       | ~10K       | ~2K         | ~12K             |
| **Total**   | **~33** |            |             | **~212K tokens** |

At Claude Sonnet 4.5 pricing ($3/M input, $15/M output): **~$1.10 per document analysis**.

---

## Inngest Rate Limiting

| API        | Limit   | Enforcement                              |
| ---------- | ------- | ---------------------------------------- |
| Voyage AI  | 300 RPM | Inngest concurrency: 3 embedding batches |
| Claude API | 60 RPM  | Inngest step-level throttling            |

Inngest retry policy: 5 retries with exponential backoff, 5-minute step timeout.
