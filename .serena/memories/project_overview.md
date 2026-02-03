# VibeDocs - Project Overview

## Purpose
VibeDocs is an open-source, LLM-powered application for non-disclosure agreement analysis. Users upload NDAs and the system extracts clauses, identifies risky or missing terms, compares documents side-by-side, and generates new NDAs from battle-tested templates.

## Core Features
- Upload and analyze NDAs (PDF/DOCX)
- Clause extraction using CUAD 41-category taxonomy
- Risk scoring with cited evidence from reference corpus
- Gap analysis (missing standard clauses)
- Side-by-side NDA comparison
- NDA generation from Bonterms/CommonAccord templates
- Microsoft Word Add-in integration

## Tech Stack
| Layer | Technology |
|-------|------------|
| Framework | Next.js 16 (App Router, RSC) |
| UI | React 19, TypeScript (strict) |
| Styling | Tailwind CSS v4 (`@theme inline`, oklch colors) |
| Components | shadcn/ui (new-york style) + AI SDK Elements |
| Database | Neon PostgreSQL + pgvector (HNSW indexes) |
| ORM | Drizzle ORM |
| Embeddings | Voyage AI voyage-law-2 (1024 dims, 16K context) |
| LLM | Claude Sonnet 4.5 (AI SDK 6 `generateObject()`) |
| Orchestration | Inngest (durable workflows) |
| Auth | Auth.js v5 with Drizzle adapter |
| Package Manager | pnpm |

## Two-Tier Database Architecture
1. **Shared Reference DB** (read-only): CUAD clauses, ContractNLI, Bonterms/CommonAccord templates (~33K vectors)
2. **Tenant DB** (RLS-enforced): user documents, analyses, comparisons, generated NDAs

## Agent Pipeline
```
Parser Agent → Classifier Agent → Risk Scorer Agent → Gap Analyst Agent
```
Each agent runs inside `inngest step.run()` for durability. AI SDK 6 `generateObject()` for structured output.

## Key Documentation
- Full specification: `docs/PRD.md`
- Claude Code guidance: `CLAUDE.md`
- Word Add-in spec: `docs/PRD-word-addin.md`
