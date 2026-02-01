# Product Requirements Document: NDA Analyst

**Project Codename:** NDA Analyst
**Version:** 1.0.0-draft
**Last Updated:** February 1, 2026
**Author:** Mike (Principal Engineer)
**Status:** Architecture Complete — Pre-Implementation

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Problem Statement](#2-problem-statement)
3. [Goals and Non-Goals](#3-goals-and-non-goals)
4. [User Personas](#4-user-personas)
5. [User Stories](#5-user-stories)
6. [System Architecture Overview](#6-system-architecture-overview)
7. [Data Architecture](#7-data-architecture)
8. [Bootstrap Pipeline](#8-bootstrap-pipeline)
9. [Feature Specifications](#9-feature-specifications)
10. [Agent Architecture](#10-agent-architecture)
11. [Database Schema](#11-database-schema)
12. [API Design](#12-api-design)
13. [UI/UX Requirements](#13-uiux-requirements)
14. [Multi-Tenancy Architecture](#14-multi-tenancy-architecture)
15. [Security and Compliance](#15-security-and-compliance)
16. [Testing Strategy](#16-testing-strategy)
17. [Infrastructure and Deployment](#17-infrastructure-and-deployment)
18. [Cost Estimates](#18-cost-estimates)
19. [Milestones and Roadmap](#19-milestones-and-roadmap)
20. [Technical Decision Log](#20-technical-decision-log)
21. [Risks and Mitigations](#21-risks-and-mitigations)
22. [Open Questions](#22-open-questions)
23. [Appendices](#23-appendices)

---

## 1. Executive Summary

NDA Analyst is an open-source, LLM-powered application for non-disclosure agreement analysis. Users upload NDAs and the system extracts clauses, identifies risky or missing terms, compares documents side-by-side, and generates new NDAs from battle-tested templates. The system is powered by a Retrieval-Augmented Generation (RAG) pipeline over curated legal datasets, with Claude as the reasoning engine and Voyage AI's legal-specific embeddings for semantic search.

This is a non-commercial, portfolio-grade project designed to demonstrate production-level AI agent orchestration, durable workflow execution, multi-granularity vector search, and modern full-stack architecture. It is not a standalone model host — it leverages API-based LLM inference over a rich dataset layer.

### Core Value Proposition

Upload an NDA. In under 60 seconds, receive a clause-by-clause extraction with risk scoring, a gap analysis against industry-standard templates, and a side-by-side comparison with any other NDA in the system — all grounded in 1,100+ real-world contracts and 13,000+ annotated clauses.

---

## 2. Problem Statement

Non-disclosure agreements are the most common commercial contract, yet reviewing them remains a manual, expertise-dependent process. Small teams and individual founders sign NDAs without understanding their risk exposure. Existing contract analysis tools are expensive ($500+/month), closed-source, and opaque in their methodology.

The specific problems this project addresses:

**For individuals and small teams:** No affordable way to understand whether an NDA's terms are standard, aggressive, or missing critical protections. Reviewing a single NDA with outside counsel costs $500–2,000.

**For legal professionals:** No open-source tool provides structured clause extraction grounded in annotated legal datasets. Existing tools use generic NLP models not trained on contract-specific taxonomy.

**For the AI/legal-tech community:** No open reference implementation demonstrates production-grade RAG over legal corpora with multi-agent orchestration, durable workflows, and multi-granularity vector search.

---

## 3. Goals and Non-Goals

### Goals (MVP — 4 weeks)

- Upload a PDF or DOCX NDA and extract all clauses with category labels aligned to the CUAD 41-category taxonomy
- Score each clause for risk level (standard / cautious / aggressive / missing) grounded in evidence from annotated datasets
- Compare two NDAs side-by-side at the clause level, highlighting differences and gaps
- Generate new NDAs from Bonterms and CommonAccord templates with user-specified parameters
- Provide all analysis with cited evidence from the reference corpus, not just LLM opinion
- Run the full analysis pipeline as a durable, resumable workflow (Inngest)
- Deploy as a publicly accessible application on Vercel

### Goals (Post-MVP)

- ContractNLI 17-hypothesis Natural Language Inference (entailment/contradiction scoring per NDA)
- Batch analysis (upload multiple NDAs, generate portfolio-level risk dashboard)
- Custom clause library (users save preferred clauses for reuse in generated NDAs)
- Export analysis as structured PDF report
- Webhook/API access for programmatic NDA analysis
- Fine-grained RBAC with team workspaces

### Non-Goals

- Training or fine-tuning custom models (we use API-based inference only)
- GPU infrastructure or self-hosted model serving
- Real-time collaborative editing of NDAs
- E-signature or contract execution workflows
- Support for contract types beyond NDAs in MVP
- Legal advice — all output includes disclaimers that this is not legal counsel
- Mobile-native application (responsive web only)

---

## 4. User Personas

### Alex — Startup Founder

Alex is a first-time founder who receives NDAs from potential partners and investors. He has no legal background and currently signs NDAs after a cursory read, hoping the terms are standard. He wants to upload an NDA and immediately understand what's normal, what's aggressive, and what's missing — without paying a lawyer $1,500 for a review.

**Key needs:** Upload and get results in under 2 minutes. Plain-language risk explanations. Side-by-side comparison with a "standard" NDA template. Confidence that the analysis is grounded in real data, not hallucination.

### Sarah — In-House Counsel

Sarah reviews 20+ NDAs per month at a mid-size tech company. Her workflow involves manually comparing incoming NDAs against the company's preferred template, flagging deviations for negotiation. She wants to automate the comparison step and generate first-draft redlines.

**Key needs:** Clause-by-clause extraction aligned to standard legal categories. Side-by-side diff view. Ability to set her own preferred template as the comparison baseline. Export results for inclusion in legal review memos.

### Dev — Open Source Contributor

Dev is an AI engineer interested in legal NLP. He wants to study the architecture, understand the RAG pipeline design, contribute improvements, and potentially adapt the system for other contract types.

**Key needs:** Clean, well-documented codebase. Clear separation of concerns. Comprehensive CLAUDE.md and inline documentation. Easy local development setup.

---

## 5. User Stories

### Upload and Analyze

- **US-001:** As a user, I can upload a PDF or DOCX NDA so that the system can analyze it.
- **US-002:** As a user, I can see a progress indicator while my NDA is being processed so that I know the system is working.
- **US-003:** As a user, I receive a clause-by-clause extraction of my NDA with each clause labeled by category (e.g., "Governing Law," "Non-Compete," "IP Ownership") so that I understand the structure.
- **US-004:** As a user, I see a risk score for each clause (standard / cautious / aggressive) with a plain-language explanation so that I understand my exposure.
- **US-005:** As a user, I see which standard NDA clauses are missing from my document so that I know what protections I lack.
- **US-006:** As a user, each risk assessment includes cited evidence from the reference corpus (e.g., "This non-compete duration exceeds 87% of NDAs in our dataset") so that I trust the analysis.

### Compare

- **US-007:** As a user, I can select two NDAs to compare side-by-side so that I can see how they differ.
- **US-008:** As a user, I see clause-level alignment between two NDAs with differences highlighted so that I can quickly identify negotiation points.
- **US-009:** As a user, I can compare my uploaded NDA against a standard Bonterms template so that I understand deviations from best practice.

### Generate

- **US-010:** As a user, I can generate a new mutual NDA by specifying key parameters (parties, governing law, duration, confidentiality period) so that I have a starting point for negotiation.
- **US-011:** As a user, generated NDAs use battle-tested Bonterms or CommonAccord templates so that I know the base language is professionally drafted.
- **US-012:** As a user, I can customize specific clauses in a generated NDA before downloading so that the output matches my needs.

### Account and History

- **US-013:** As a user, I can sign up and log in so that my uploaded NDAs and analyses are saved.
- **US-014:** As a user, I can view my analysis history so that I can revisit previous reviews.
- **US-015:** As a user, my uploaded documents are private and not visible to other users.

---

## 6. System Architecture Overview

### Technology Stack

| Layer                 | Technology             | Version                    | Rationale                                    |
| --------------------- | ---------------------- | -------------------------- | -------------------------------------------- |
| **Framework**         | Next.js                | 16                         | App Router, RSC, Turbopack, server actions   |
| **UI Library**        | React                  | 19                         | Server components, concurrent features       |
| **Styling**           | Tailwind CSS           | v4                         | Utility-first, JIT compilation               |
| **Component Library** | shadcn/ui              | latest                     | Every component customized to purpose        |
| **Database**          | Neon PostgreSQL        | PG 16                      | Serverless, branching, scale-to-zero         |
| **Vector Extension**  | pgvector               | 0.7+                       | HNSW indexes, cosine distance                |
| **ORM**               | Drizzle ORM            | 0.45+                      | Native pgvector, 7kb bundle, type-safe       |
| **Embeddings**        | Voyage AI voyage-law-2 | -                          | 1024 dimensions, legal-specific, 16K context |
| **LLM**               | Claude API             | claude-sonnet-4-5-20250929 | Structured output, tool use, 200K context    |
| **Orchestration**     | Inngest                | 3.x                        | Durable steps, rate limiting, dashboard      |
| **File Parsing**      | pdf-parse + mammoth    | -                          | PDF and DOCX text extraction                 |
| **Authentication**    | Auth.js (NextAuth v5)  | 5.x                        | Drizzle adapter, OAuth + email               |
| **Hosting**           | Vercel                 | -                          | Edge + Node.js runtimes, preview deploys     |
| **Schema Validation** | Zod                    | 3.x                        | Runtime validation, Drizzle integration      |

### High-Level Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        Vercel (Hosting)                         │
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────────┐  │
│  │  Next.js App │  │  API Routes  │  │  Inngest Serve Route  │  │
│  │  (React 19)  │  │  (Node.js)   │  │  /api/inngest         │  │
│  └──────┬───────┘  └──────┬───────┘  └───────────┬───────────┘  │
│         │                 │                       │              │
└─────────┼─────────────────┼───────────────────────┼──────────────┘
          │                 │                       │
          │                 ▼                       ▼
          │        ┌────────────────┐      ┌────────────────┐
          │        │  Claude API    │      │  Inngest Cloud │
          │        │  (Sonnet 4.5)  │      │  (Orchestrator)│
          │        └────────────────┘      └────────┬───────┘
          │                                         │
          │        ┌────────────────┐               │ Durable Steps:
          │        │  Voyage AI     │               │ - Parse document
          │        │  (Embeddings)  │               │ - Generate embeddings
          │        └────────────────┘               │ - Run analysis agents
          │                                         │ - Store results
          ▼                                         ▼
  ┌───────────────────────────────────────────────────────────┐
  │                    Neon PostgreSQL                         │
  │                                                           │
  │  ┌─────────────────────┐    ┌──────────────────────────┐  │
  │  │  Shared Reference   │    │  Tenant-Scoped Data      │  │
  │  │  Database           │    │  Database(s)             │  │
  │  │                     │    │                          │  │
  │  │  - CUAD clauses     │    │  - User documents        │  │
  │  │  - ContractNLI      │    │  - Document chunks       │  │
  │  │  - Bonterms         │    │  - Analysis results      │  │
  │  │  - CommonAccord     │    │  - Generated NDAs        │  │
  │  │  - Reference embeds │    │  - User embeddings       │  │
  │  └─────────────────────┘    └──────────────────────────┘  │
  └───────────────────────────────────────────────────────────┘
```

### Request Flow (Upload and Analyze)

1. User uploads NDA via the web UI (file input component)
2. Next.js server action validates file type and size, stores raw file in object storage or database
3. Server action sends `nda/uploaded` event to Inngest
4. Inngest orchestrates the analysis pipeline as durable steps:
   - **Step 1 — Parse:** Extract text from PDF/DOCX using pdf-parse or mammoth
   - **Step 2 — Chunk:** Split document into legal sections (clause-aware chunking)
   - **Step 3 — Embed:** Generate Voyage AI voyage-law-2 embeddings for each chunk
   - **Step 4 — Store:** Bulk insert chunks and embeddings into tenant database
   - **Step 5 — Analyze:** For each chunk, query shared reference DB for similar clauses from CUAD, then call Claude to classify category and assess risk
   - **Step 6 — Gap Analysis:** Compare extracted categories against the full CUAD 41-category taxonomy to identify missing clauses
   - **Step 7 — Persist Results:** Store structured analysis in tenant database
5. UI polls or subscribes to analysis status, renders results progressively
6. User views clause-by-clause analysis with risk scores and cited evidence

---

## 7. Data Architecture

### Two-Tier Data Model

The system separates **shared, read-only reference data** from **tenant-scoped user data**. This is a fundamental architectural decision: reference corpora are global resources that every tenant queries, while user documents and analyses are strictly isolated.

#### Tier 1 — Shared Reference Database

A single Neon project containing all bootstrapped legal corpora. Read-only after the initial ingestion pipeline completes. No tenant scoping, no RLS — all queries are public reads.

**Contents:**

| Dataset             | Records                         | Embedding Count | Purpose                                                     |
| ------------------- | ------------------------------- | --------------- | ----------------------------------------------------------- |
| CUAD                | 510 contracts, 13K+ annotations | ~15K vectors    | Clause taxonomy and category classification (41 categories) |
| ContractNLI         | 607 NDAs, 17 hypotheses         | ~10K vectors    | Natural language inference evidence spans                   |
| Bonterms Mutual NDA | 1 template                      | ~50 vectors     | Enterprise-grade NDA generation template                    |
| CommonAccord NDA    | 3–5 templates                   | ~100 vectors    | Modular Prose Object NDA templates                          |
| Kleister-NDA        | 540 NDAs                        | ~8K vectors     | Evaluation and benchmarking dataset                         |

**Total estimated vectors:** ~33K at 1024 dimensions each (voyage-law-2)

**Connection pattern:** Drizzle client configured with `neon-http` (Edge-compatible, read-only, no transactions needed).

#### Tier 2 — Tenant-Scoped Database

For MVP, a single shared Neon project with Row-Level Security (RLS) enforcing tenant isolation via `tenant_id` columns on all tables. Post-MVP, eligible for migration to project-per-tenant for compliance-sensitive deployments.

**Contents:**

- User-uploaded NDA documents (metadata + raw text)
- Document chunks with voyage-law-2 embeddings
- Structured analysis results (clause extractions, risk scores, gap analysis)
- Generated NDA drafts
- Comparison snapshots
- User accounts, sessions, organizations

**Connection pattern:** Drizzle client configured with `neon-serverless` (WebSocket, transactions required for writes). RLS policies enforce `tenant_id` matching via `current_setting('app.tenant_id')`.

#### Query-Time Merge Pattern

RAG retrieval queries both databases in parallel and merges results before passing context to Claude:

```typescript
const [referenceHits, tenantHits] = await Promise.all([
  sharedDb
    .select(/* ... */)
    .from(referenceEmbeddings)
    .where(lt(cosineDistance(embedding, queryVec), 0.3))
    .orderBy(cosineDistance(embedding, queryVec))
    .limit(8),
  tenantDb
    .select(/* ... */)
    .from(tenantEmbeddings)
    .where(
      and(
        eq(tenantEmbeddings.tenantId, ctx.tenantId),
        lt(cosineDistance(embedding, queryVec), 0.3),
      ),
    )
    .orderBy(cosineDistance(embedding, queryVec))
    .limit(5),
]);

const mergedContext = deduplicateAndRank([...referenceHits, ...tenantHits]);
```

---

## 8. Bootstrap Pipeline

The bootstrap pipeline ingests all reference corpora into Tier 1 (shared reference database) using Inngest for durability, rate-limit handling, and observability. This runs once during initial setup and can be re-triggered idempotently when datasets are updated.

### Pipeline Architecture

```
┌──────────────────┐
│  nda/bootstrap    │   Orchestrator event
│  .start           │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  Step: Download   │   HuggingFace Datasets Server API
│  datasets         │   → Parquet files via HTTP
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  Step: Parse      │   parquet-wasm + apache-arrow
│  CUAD             │   → Extract 13K+ clause annotations
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  Step: Parse      │   JSON processing
│  ContractNLI      │   → Extract evidence spans per hypothesis
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  Step: Parse      │   marked (markdown parser)
│  Templates        │   → Extract clause structure from Bonterms/CommonAccord
└────────┬─────────┘
         │
         ▼
┌──────────────────────────────┐
│  Fan-out: Generate Embeddings │   Voyage AI voyage-law-2
│  (batches of 128 texts)       │   Throttled: 300 RPM
│  → Inngest concurrency: 3     │   Retries: 5 with exponential backoff
└────────┬─────────────────────┘
         │
         ▼
┌──────────────────┐
│  Step: Bulk       │   Multi-row INSERT (500 rows/batch)
│  Insert to Neon   │   Via neon-serverless driver
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  Step: Create     │   HNSW indexes built AFTER data load
│  Indexes          │   m=16, ef_construction=64
└──────────────────┘
```

### Dataset Sources and Parsing

**CUAD (Contract Understanding Atticus Dataset)**

- Source: `https://huggingface.co/datasets/theatticusproject/cuad-qa`
- Format: SQuAD 2.0 JSON (question/answer pairs)
- ID format: `ContractName__CategoryName__Index`
- 41 categories including: Document Name, Parties, Agreement Date, Effective Date, Expiration Date, Renewal Term, Notice Period, Governing Law, Non-Compete, Exclusivity, No-Solicit, IP Ownership Assignment, License Grant, Non-Transferable License, Anti-Assignment, Revenue/Profit Sharing, Price Restrictions, Minimum Commitment, Volume Restriction, Audit Rights, Uncapped Liability, Cap on Liability, Liquidated Damages, Termination for Convenience, Most Favored Nation, Post-Termination Services, Competitive Restriction Exception, Change of Control, ROFR/ROFO/ROFN, Insurance, Covenant Not to Sue, Third Party Beneficiary, Warranty Duration
- Extraction: Contract full text, clause text with character positions, category label, answerable/unanswerable flag

**ContractNLI**

- Source: `https://huggingface.co/datasets/kiddothe2b/contract-nli`
- Format: JSON with documents, spans, annotation_sets, hypotheses
- 17 hypotheses covering: Confidential Information identification, use restrictions, sharing permissions, disclosure requirements, notice of compelled disclosure, return/destruction obligations, non-competition/solicitation, survival period, permissible development, parties to agreement, warranty disclaimers, no obligation to disclose, remedies for breach, relationship between parties, integration clause, governing law, amendment requirements
- Labels: Entailment / Contradiction / NotMentioned
- Extraction: Evidence spans with character offsets per hypothesis per document

**Bonterms Mutual NDA**

- Source: `https://github.com/Bonterms/Mutual-NDA`
- Format: Markdown
- License: CC BY 4.0
- Extraction: Section structure, defined terms, clause text, section numbering

**CommonAccord NDA Templates**

- Source: `https://github.com/CommonAccord/NW-NDA` (plus `CooleyGo-NDA`, `Agt-NDA-CmA`)
- Format: Prose Objects (key-value markdown)
- License: CC0 public domain
- Extraction: Modular clause components, variable slots, section hierarchy

**Kleister-NDA**

- Source: `https://github.com/applicaai/kleister-nda`
- Format: Plain text NDAs with metadata annotations
- License: Public domain
- 540 NDAs (254 train / 83 dev / 203 test)
- Extraction: Full document text, structured metadata (parties, dates, terms)

### Embedding Strategy

**Model:** Voyage AI `voyage-law-2`

| Parameter              | Value                                     |
| ---------------------- | ----------------------------------------- |
| Dimensions             | 1024 (fixed)                              |
| Max input tokens       | 16,000                                    |
| Pricing                | $0.12 per million tokens                  |
| Batch limit            | 1,000 texts or 120,000 tokens per request |
| inputType for indexing | `"document"`                              |
| inputType for search   | `"query"`                                 |

**Multi-granularity embedding strategy:** Each document is embedded at multiple levels to support different retrieval use cases:

- **Clause-level:** Individual CUAD annotations (~13K vectors). Used for precise clause matching and category classification.
- **Evidence span-level:** ContractNLI evidence spans per hypothesis (~10K vectors). Used for NLI-grounded risk assessment.
- **Section-level:** Paragraph-sized chunks from full contract text (~8K vectors). Used for broad contextual retrieval and gap analysis.
- **Template-level:** Bonterms/CommonAccord section embeddings (~150 vectors). Used for NDA generation clause selection.

**Chunking parameters:**

- Max tokens per chunk: 512
- Overlap: 50 tokens
- Split strategy: Legal section patterns first (`ARTICLE`, `Section`, numbered clauses), then sentence boundaries as fallback
- Each chunk preserves a `section_path` (e.g., `["Article 5", "Section 5.2", "Clause (b)"]`) for hierarchical retrieval

### Idempotency

Every document is assigned a `content_hash` (SHA-256 of normalized text). The pipeline uses `ON CONFLICT (content_hash) DO NOTHING` to prevent duplicate insertions on re-runs. Inngest's built-in step memoization ensures that successfully completed steps are not re-executed on retry.

### Estimated Pipeline Cost

| Resource              | Estimate                                                 |
| --------------------- | -------------------------------------------------------- |
| Voyage AI embeddings  | ~100M tokens × $0.12/M = **$12**                         |
| Neon database         | Free tier (0.5 GiB storage, sufficient for ~33K vectors) |
| Inngest orchestration | Free tier (50K step executions/month)                    |
| HuggingFace downloads | Free (public datasets)                                   |

---

## 9. Feature Specifications

### F-001: Document Upload

**Description:** Users upload NDA documents in PDF or DOCX format for analysis.

**Acceptance Criteria:**

- Accept PDF (.pdf) and DOCX (.docx) files
- Maximum file size: 10MB
- Validate file type server-side (magic bytes, not just extension)
- Extract text using pdf-parse (PDF) or mammoth (DOCX)
- Store raw file and extracted text in tenant database
- Display upload progress and processing status
- Handle extraction failures gracefully (corrupt files, scanned PDFs without OCR)

**Processing Flow:**

1. Client validates file type and size
2. Server action receives file, validates, stores raw bytes
3. Send `nda/uploaded` event to Inngest with `documentId`
4. Inngest pipeline: parse → chunk → embed → store
5. UI receives completion notification

### F-002: Clause Extraction

**Description:** Parse an uploaded NDA into individual clauses, each labeled with a category from the CUAD 41-category taxonomy.

**Acceptance Criteria:**

- Extract all identifiable clauses from the document
- Assign each clause a category label from the CUAD taxonomy
- Provide a confidence score (0.0–1.0) for each classification
- Include the original text span with start/end positions
- Identify the document's structural sections (preamble, definitions, obligations, miscellaneous)
- Handle clauses that span multiple categories (assign primary and secondary labels)

**Agent Design:**

1. For each document chunk, query shared reference DB for top-5 similar CUAD clause annotations
2. Construct a prompt with the chunk text and retrieved examples
3. Claude classifies the chunk into CUAD categories with confidence scores
4. Aggregate chunk-level classifications into document-level clause extraction

### F-003: Risk Analysis

**Description:** Score each extracted clause for risk level and identify missing protections.

**Acceptance Criteria:**

- Each clause receives a risk level: `standard` | `cautious` | `aggressive` | `unknown`
- Each risk assessment includes a plain-language explanation (2–3 sentences)
- Each assessment cites evidence from the reference corpus (e.g., "This non-compete extends 36 months, while 78% of NDAs in our dataset specify 12–24 months")
- Generate a gap analysis identifying CUAD categories with no matching clause in the document
- For missing clauses, explain the typical protection and why its absence matters
- Overall document risk score: weighted average of clause-level scores

**Evidence Grounding:**

Risk scores are grounded in three data sources:

1. **CUAD distribution data:** Statistical position relative to annotated clauses across 510 contracts
2. **ContractNLI hypotheses:** Whether specific NDA obligations are entailed, contradicted, or absent
3. **Template comparison:** Deviation from Bonterms/CommonAccord standard language

### F-004: NDA Comparison

**Description:** Compare two NDAs side-by-side at the clause level.

**Acceptance Criteria:**

- Select any two documents (uploaded NDAs, reference templates, or generated drafts)
- Display clause-level alignment: matched clauses shown side-by-side, unmatched clauses highlighted as present-in-one-only
- Semantic matching (not just keyword/section-header matching) — clauses covering the same topic are aligned even if differently worded
- Highlight substantive differences in matched clauses (e.g., different durations, different scope)
- Generate a summary of key differences with risk implications

**Algorithm:**

1. Embed all clauses from both documents using voyage-law-2
2. Compute pairwise cosine similarity matrix
3. Use Hungarian algorithm or greedy matching (threshold > 0.7) for clause alignment
4. For aligned pairs, use Claude to describe substantive differences
5. Unaligned clauses flagged as gaps in the respective document

### F-005: NDA Generation

**Description:** Generate a new mutual NDA from professionally drafted templates with user-specified parameters.

**Acceptance Criteria:**

- User specifies: party names, governing law jurisdiction, effective date, confidentiality period, non-compete duration (or none), dispute resolution mechanism
- Generated NDA uses Bonterms Mutual NDA as the base template
- User can swap individual clauses from CommonAccord alternatives
- Preview generated NDA in the UI before downloading
- Export as DOCX or PDF
- Generated NDAs include a "Generated by NDA Analyst" watermark (removable)

**Generation Flow:**

1. User fills parameter form (shadcn/ui form components with Zod validation)
2. System retrieves relevant template sections from shared reference DB
3. Claude assembles the NDA, filling parameter slots and resolving cross-references
4. User reviews in a rich preview component
5. User optionally edits specific clauses inline
6. Export via server-side document generation (docx-js for DOCX, pdf-lib for PDF)

---

## 10. Agent Architecture

### Multi-Agent Pipeline

The analysis pipeline is implemented as a sequence of specialized agents, each responsible for a discrete analytical step. Agents are wrapped in Inngest steps for durability, with LangGraph.js managing agent-internal state and tool orchestration.

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

#### Parser Agent

- **Input:** Raw document text
- **Tools:** Text chunking, section detection, table extraction
- **Output:** Structured document with identified sections and chunks
- **LLM calls:** 1–2 (section boundary detection, table normalization)

#### Classifier Agent

- **Input:** Document chunks + retrieved CUAD examples
- **Tools:** Vector similarity search (shared reference DB), category validation
- **Output:** Each chunk labeled with CUAD category, confidence score, matched reference clauses
- **LLM calls:** 1 per chunk (batch where possible using structured output)

#### Risk Scorer Agent

- **Input:** Classified clauses + retrieved ContractNLI evidence + template baselines
- **Tools:** Vector similarity search, statistical comparison
- **Output:** Per-clause risk level, explanation, cited evidence
- **LLM calls:** 1 per clause with full RAG context

#### Gap Analyst Agent

- **Input:** Set of extracted categories, full CUAD taxonomy, document text
- **Tools:** Taxonomy lookup, template retrieval
- **Output:** List of missing categories with explanations and recommended language
- **LLM calls:** 1 (single pass over full taxonomy vs. extracted categories)

### Inngest-LangGraph Integration Pattern

Each agent is defined as a LangGraph.js graph wrapped inside an Inngest `step.run()` call. Inngest provides durability (retry, resume) at the agent level; LangGraph provides state management and tool routing within each agent.

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

### Claude API Configuration

| Parameter         | Value                      | Rationale                                   |
| ----------------- | -------------------------- | ------------------------------------------- |
| Model             | claude-sonnet-4-5-20250929 | Best cost/quality for structured extraction |
| Max tokens        | 4,096                      | Sufficient for clause-level analysis        |
| Temperature       | 0.0                        | Deterministic for classification tasks      |
| Structured output | JSON with Zod schema       | Type-safe response parsing                  |

### Token Budget Estimate Per Document

| Agent       | Calls   | Input/call | Output/call | Total            |
| ----------- | ------- | ---------- | ----------- | ---------------- |
| Parser      | 2       | ~8K        | ~2K         | ~20K             |
| Classifier  | ~15     | ~4K        | ~1K         | ~75K             |
| Risk Scorer | ~15     | ~6K        | ~1K         | ~105K            |
| Gap Analyst | 1       | ~10K       | ~2K         | ~12K             |
| **Total**   | **~33** |            |             | **~212K tokens** |

At Claude Sonnet 4.5 pricing ($3/M input, $15/M output): **~$1.10 per document analysis**.

---

## 11. Database Schema

### Shared Reference Database

```sql
-- Legal corpora documents (CUAD contracts, ContractNLI NDAs, templates)
CREATE TABLE reference_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL,            -- 'cuad' | 'contract_nli' | 'bonterms' | 'commonaccord' | 'kleister'
  source_id TEXT,                  -- Original ID from dataset
  title TEXT NOT NULL,
  raw_text TEXT,
  metadata JSONB DEFAULT '{}',     -- Source-specific metadata
  content_hash TEXT UNIQUE,        -- SHA-256 for idempotent ingestion
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Multi-granularity embeddings for reference corpora
CREATE TABLE reference_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES reference_documents(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES reference_embeddings(id),  -- Hierarchical: section → clause
  granularity TEXT NOT NULL,        -- 'document' | 'section' | 'clause' | 'span' | 'template'
  content TEXT NOT NULL,
  section_path TEXT[],              -- e.g., ARRAY['Article 5', 'Section 5.2']
  category TEXT,                    -- CUAD category label (for clause-level)
  hypothesis_id INTEGER,           -- ContractNLI hypothesis ID (for span-level)
  nli_label TEXT,                   -- 'entailment' | 'contradiction' | 'not_mentioned'
  embedding VECTOR(1024) NOT NULL,  -- voyage-law-2
  metadata JSONB DEFAULT '{}',
  content_hash TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- CUAD category taxonomy (41 categories with descriptions)
CREATE TABLE cuad_categories (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  risk_weight REAL DEFAULT 1.0,     -- Relative importance for risk scoring
  is_nda_relevant BOOLEAN DEFAULT true
);

-- ContractNLI hypothesis definitions
CREATE TABLE contract_nli_hypotheses (
  id INTEGER PRIMARY KEY,
  text TEXT NOT NULL,
  category TEXT                     -- Grouping for related hypotheses
);

-- Indexes (created AFTER bulk data load)
CREATE INDEX idx_ref_embed_hnsw ON reference_embeddings
  USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);
CREATE INDEX idx_ref_embed_granularity ON reference_embeddings (granularity);
CREATE INDEX idx_ref_embed_category ON reference_embeddings (category);
CREATE INDEX idx_ref_embed_document ON reference_embeddings (document_id);
CREATE INDEX idx_ref_docs_source ON reference_documents (source);
```

### Tenant-Scoped Database

```sql
-- Auth.js required tables
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT,
  email TEXT UNIQUE,
  email_verified TIMESTAMPTZ,
  image TEXT,
  organization_id UUID REFERENCES organizations(id),
  role TEXT DEFAULT 'member',       -- 'admin' | 'member' | 'viewer'
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Organizations (tenant boundary)
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  plan TEXT DEFAULT 'free',         -- 'free' | 'pro' | 'enterprise'
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  deleted_at TIMESTAMPTZ            -- Soft delete
);

-- User-uploaded NDA documents
CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES organizations(id),
  uploaded_by UUID REFERENCES users(id),
  title TEXT NOT NULL,
  file_type TEXT NOT NULL,           -- 'pdf' | 'docx'
  file_size INTEGER,
  raw_text TEXT,
  status TEXT DEFAULT 'uploaded',    -- 'uploaded' | 'parsing' | 'embedding' | 'analyzing' | 'complete' | 'failed'
  error_message TEXT,
  metadata JSONB DEFAULT '{}',
  content_hash TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  deleted_at TIMESTAMPTZ
);

-- Document chunks with embeddings
CREATE TABLE document_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES organizations(id),
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  section_path TEXT[],
  embedding VECTOR(1024),            -- voyage-law-2
  token_count INTEGER,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Analysis results (one per document)
CREATE TABLE analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES organizations(id),
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'pending',     -- 'pending' | 'running' | 'complete' | 'failed'
  overall_risk_score REAL,           -- 0.0 (safe) to 1.0 (aggressive)
  overall_risk_level TEXT,           -- 'standard' | 'cautious' | 'aggressive'
  summary TEXT,                      -- LLM-generated executive summary
  gap_analysis JSONB,                -- Missing categories with explanations
  token_usage JSONB,                 -- { input: N, output: N, cost_usd: N }
  processing_time_ms INTEGER,
  version INTEGER DEFAULT 1,         -- Optimistic locking
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Individual clause extractions within an analysis
CREATE TABLE clause_extractions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES organizations(id),
  analysis_id UUID NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  chunk_id UUID REFERENCES document_chunks(id),
  category TEXT NOT NULL,            -- CUAD category name
  secondary_categories TEXT[],       -- Additional applicable categories
  clause_text TEXT NOT NULL,
  start_position INTEGER,
  end_position INTEGER,
  confidence REAL NOT NULL,          -- 0.0 to 1.0
  risk_level TEXT NOT NULL,          -- 'standard' | 'cautious' | 'aggressive' | 'unknown'
  risk_explanation TEXT,
  evidence JSONB,                    -- Cited reference clauses supporting the assessment
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- NDA comparisons
CREATE TABLE comparisons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES organizations(id),
  document_a_id UUID NOT NULL REFERENCES documents(id),
  document_b_id UUID NOT NULL REFERENCES documents(id),
  status TEXT DEFAULT 'pending',
  summary TEXT,
  clause_alignments JSONB,           -- Matched clause pairs with diff descriptions
  key_differences JSONB,             -- Summarized differences with risk implications
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Generated NDA drafts
CREATE TABLE generated_ndas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES organizations(id),
  created_by UUID REFERENCES users(id),
  title TEXT NOT NULL,
  template_source TEXT NOT NULL,     -- 'bonterms' | 'commonaccord'
  parameters JSONB NOT NULL,         -- User-specified generation parameters
  content TEXT NOT NULL,             -- Full generated NDA text
  content_html TEXT,                 -- Rendered HTML for preview
  status TEXT DEFAULT 'draft',       -- 'draft' | 'finalized' | 'exported'
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Audit log
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES organizations(id),
  table_name TEXT NOT NULL,
  record_id UUID NOT NULL,
  action TEXT NOT NULL,              -- 'INSERT' | 'UPDATE' | 'DELETE' | 'ACCESS' | 'DOWNLOAD' | 'EXPORT'
  old_values JSONB,
  new_values JSONB,
  user_id UUID,
  ip_address TEXT,
  performed_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Row-Level Security policies
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE clause_extractions ENABLE ROW LEVEL SECURITY;
ALTER TABLE comparisons ENABLE ROW LEVEL SECURITY;
ALTER TABLE generated_ndas ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- RLS policy (applied to all tenant-scoped tables)
-- Uses session variable set by application middleware
CREATE POLICY tenant_isolation ON documents
  USING (tenant_id = current_setting('app.tenant_id')::uuid);

-- Indexes
CREATE INDEX idx_docs_tenant ON documents (tenant_id, created_at DESC);
CREATE INDEX idx_chunks_document ON document_chunks (document_id, chunk_index);
CREATE INDEX idx_chunks_tenant ON document_chunks (tenant_id);
CREATE INDEX idx_chunks_hnsw ON document_chunks
  USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);
CREATE INDEX idx_analyses_document ON analyses (document_id);
CREATE INDEX idx_clauses_analysis ON clause_extractions (analysis_id);
CREATE INDEX idx_clauses_category ON clause_extractions (category);
CREATE INDEX idx_audit_tenant ON audit_logs (tenant_id, table_name, performed_at DESC);
```

### Drizzle Schema Organization

```
src/db/
├── index.ts                    # Database client exports (shared + tenant)
├── shared/
│   ├── schema.ts               # Reference database schema
│   └── client.ts               # neon-http client (read-only)
├── tenant/
│   ├── schema/
│   │   ├── index.ts            # Barrel export
│   │   ├── auth.ts             # Auth.js tables (users, accounts, sessions)
│   │   ├── documents.ts        # Documents + chunks
│   │   ├── analyses.ts         # Analyses + clause extractions
│   │   ├── comparisons.ts      # Comparison results
│   │   ├── generated.ts        # Generated NDA drafts
│   │   └── audit.ts            # Audit logs
│   ├── relations.ts            # Centralized Drizzle relations
│   └── client.ts               # neon-serverless client (read/write)
├── queries/
│   ├── similarity.ts           # Vector search helpers
│   ├── documents.ts            # Document CRUD
│   └── analyses.ts             # Analysis CRUD
└── _columns.ts                 # Reusable column definitions (timestamps, soft delete, etc.)
```

---

## 12. API Design

### Response Shape

All API endpoints return a consistent response envelope:

```typescript
type ApiResponse<T> = {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  meta?: {
    requestId: string;
    processingTimeMs: number;
  };
};
```

### Endpoints

#### Documents

| Method | Path                    | Description                               |
| ------ | ----------------------- | ----------------------------------------- |
| POST   | `/api/documents/upload` | Upload NDA document (multipart/form-data) |
| GET    | `/api/documents`        | List user's documents (paginated)         |
| GET    | `/api/documents/[id]`   | Get document details + status             |
| DELETE | `/api/documents/[id]`   | Soft-delete a document                    |

#### Analyses

| Method | Path                         | Description                            |
| ------ | ---------------------------- | -------------------------------------- |
| POST   | `/api/analyses`              | Trigger analysis for a document        |
| GET    | `/api/analyses/[id]`         | Get analysis results                   |
| GET    | `/api/analyses/[id]/clauses` | Get clause extractions for an analysis |
| GET    | `/api/analyses/[id]/gaps`    | Get gap analysis results               |
| GET    | `/api/analyses/[id]/status`  | Poll analysis progress                 |

#### Comparisons

| Method | Path                    | Description                             |
| ------ | ----------------------- | --------------------------------------- |
| POST   | `/api/comparisons`      | Create comparison between two documents |
| GET    | `/api/comparisons/[id]` | Get comparison results                  |

#### Generation

| Method | Path                        | Description                            |
| ------ | --------------------------- | -------------------------------------- |
| POST   | `/api/generate`             | Generate NDA with specified parameters |
| GET    | `/api/generate/[id]`        | Get generated NDA                      |
| POST   | `/api/generate/[id]/export` | Export as DOCX or PDF                  |

#### Inngest

| Method | Path           | Description                                           |
| ------ | -------------- | ----------------------------------------------------- |
| ANY    | `/api/inngest` | Inngest serve handler (all functions registered here) |

### Server Actions (Preferred for UI Mutations)

```typescript
// app/(dashboard)/documents/actions.ts
"use server";

export async function uploadDocument(
  formData: FormData,
): Promise<ApiResponse<Document>>;
export async function deleteDocument(
  documentId: string,
): Promise<ApiResponse<void>>;
export async function triggerAnalysis(
  documentId: string,
): Promise<ApiResponse<Analysis>>;
export async function createComparison(
  docAId: string,
  docBId: string,
): Promise<ApiResponse<Comparison>>;
export async function generateNDA(
  params: GenerateParams,
): Promise<ApiResponse<GeneratedNDA>>;
```

---

## 13. UI/UX Requirements

### Design System

- **Foundation:** Every ShadCN component installed and customized for the legal domain
- **Aesthetic:** Glassmorphism with frosted glass cards, subtle gradients, and depth
- **Typography:** Inter for body, JetBrains Mono for code/data. Legal document previews use a serif stack
- **Color palette:** Dark mode primary. Legal-green accents for safe/standard, amber for cautious, red for aggressive
- **Motion:** Buttery smooth transitions. Framer Motion for layout animations. Progressive disclosure with animated accordions for clause details

### Key Screens

#### Dashboard

- Document list with status indicators (uploading → analyzing → complete)
- Quick stats: total documents, average risk score, most common gaps
- Recent analyses with one-click navigation

#### Upload Flow

- Drag-and-drop zone (shadcn/ui dropzone) with file type validation
- Real-time progress bar during upload
- Animated transition to analysis-in-progress view
- Progressive result rendering as agents complete

#### Analysis View

- Document preview panel (left) with highlighted clause spans
- Clause list panel (right) with expandable cards per clause
- Each clause card shows: category badge, risk indicator, explanation, "Show Evidence" expandable section
- Gap analysis section at bottom with recommended additions
- Overall risk score prominently displayed with a gauge/meter component
- Export button: PDF report, JSON data

#### Comparison View

- Side-by-side document panels with synchronized scrolling
- Clause alignment lines connecting matched clauses visually
- Color-coded differences: green (safer in A), red (riskier in A), yellow (different but neutral)
- Summary panel at top with key takeaways

#### Generation View

- Multi-step form wizard (parameters → clause selection → preview → export)
- Live preview panel updating as parameters change
- Inline clause editing with rich text (basic formatting)
- Template switcher (Bonterms vs. CommonAccord)

### Responsive Design

- Mobile-first responsive layout
- On mobile: analysis view collapses to single-column with tabbed navigation between document and clauses
- Comparison view: stacked on mobile with swipe between documents

---

## 14. Multi-Tenancy Architecture

### MVP: Shared Database with RLS

For MVP, all tenants share a single Neon project with Row-Level Security enforcing isolation. This simplifies deployment and reduces cost while providing strong security guarantees.

**Implementation:**

1. All tenant-scoped tables include a `tenant_id UUID NOT NULL` column
2. RLS policies enforce `tenant_id = current_setting('app.tenant_id')::uuid` on SELECT, INSERT, UPDATE, DELETE
3. Application middleware sets `app.tenant_id` session variable in a transaction before every query
4. Drizzle `pgPolicy` declarations in schema files generate proper PostgreSQL policies during migration
5. Composite indexes on `(tenant_id, ...)` ensure query performance

**Defense in depth:** Even if RLS is bypassed (e.g., migration scripts), the application layer wraps all queries with explicit `WHERE tenant_id = ?` filters via a tenant-scoped Drizzle wrapper.

### Post-MVP: Project-Per-Tenant Option

For compliance-sensitive customers (law firms, enterprises), migrate to Neon's project-per-tenant model:

- Each organization gets a dedicated Neon project
- Independent PITR, regional data residency
- Tenant routing via catalog database
- Neon API for automated provisioning and teardown
- Scale-to-zero economics for inactive tenants

---

## 15. Security and Compliance

### Data Protection

- All documents encrypted at rest (Neon's default AES-256)
- All connections use TLS 1.3
- Raw document files stored with `content_hash` for integrity verification
- Soft delete for all user data (30-day retention before hard purge)
- Audit log records all data access, modifications, downloads, and exports

### Authentication

- Auth.js v5 with Drizzle adapter
- OAuth providers: Google, GitHub (MVP). Microsoft and SAML post-MVP.
- Email magic link as fallback
- Session-based authentication with secure httpOnly cookies
- CSRF protection via Next.js built-in mechanisms

### Authorization

- Organization-level tenancy with role-based access: Admin, Member, Viewer
- Admins: full CRUD, user management, billing
- Members: upload, analyze, compare, generate
- Viewers: read-only access to analyses and comparisons

### Legal Disclaimers

- All analysis output includes a persistent disclaimer: "This analysis is generated by AI and does not constitute legal advice. Consult a qualified attorney for legal guidance."
- Generated NDAs include a footer: "Generated by NDA Analyst. Review by qualified counsel recommended before execution."

### Rate Limiting

- Upload: 10 documents per hour per user
- Analysis: 5 concurrent analyses per organization
- Generation: 20 NDAs per hour per user
- API (post-MVP): Standard rate limiting per API key

---

## 16. Testing Strategy

### Unit Tests (Vitest)

- Drizzle query builders tested against PGLite (in-memory Postgres via WASM)
- Agent prompt construction and response parsing
- Document chunking and section detection
- Risk scoring algorithms
- Zod schema validation

### Integration Tests

- Full pipeline tests using Neon branching (instant copy-on-write database per PR)
- Inngest function tests using `inngest/test` utilities
- Voyage AI embedding integration (with mocked responses for CI, real API for nightly runs)
- Claude API integration (mocked for CI, real API for nightly runs)

### End-to-End Tests (Playwright)

- Upload flow: file upload → processing → results display
- Comparison flow: select two documents → view aligned clauses
- Generation flow: fill parameters → preview → export
- Authentication: sign up, sign in, session management
- Multi-tenant isolation: verify user A cannot see user B's documents

### Test Data

- `drizzle-seed` for generating realistic tenant data with deterministic seeding
- Fixture NDAs: 5 hand-curated NDAs with known risk profiles for regression testing
- Golden output files for agent responses (snapshot testing)

### CI/CD Pipeline

```yaml
# Triggered on: push to main, PR creation
1. Lint (ESLint + Prettier)
2. Type check (tsc --noEmit)
3. Unit tests (Vitest + PGLite)
4. Create Neon branch (PR-specific)
5. Run migrations on branch
6. Integration tests against branch
7. Build (next build)
8. Deploy preview (Vercel)
9. E2E tests against preview URL
10. Clean up Neon branch (on PR close)
```

---

## 17. Infrastructure and Deployment

### Vercel Configuration

| Setting           | Value                                                   |
| ----------------- | ------------------------------------------------------- |
| Framework         | Next.js 16                                              |
| Build command     | `pnpm build`                                            |
| Node.js version   | 20.x                                                    |
| Regions           | `iad1` (US East, co-located with Neon)                  |
| Function timeout  | 60s (Pro plan)                                          |
| Edge functions    | Lightweight reads (document list, status polling)       |
| Node.js functions | Document processing, Claude API calls, Inngest handlers |

### Environment Variables

```env
# Neon - Shared Reference DB
SHARED_DATABASE_URL=postgresql://...@...-pooler.us-east-2.aws.neon.tech/reference?sslmode=require
SHARED_DATABASE_URL_DIRECT=postgresql://...@....us-east-2.aws.neon.tech/reference?sslmode=require

# Neon - Tenant DB
DATABASE_URL=postgresql://...@...-pooler.us-east-2.aws.neon.tech/tenant?sslmode=require
DATABASE_URL_DIRECT=postgresql://...@....us-east-2.aws.neon.tech/tenant?sslmode=require

# Voyage AI
VOYAGE_API_KEY=pa-...

# Anthropic
ANTHROPIC_API_KEY=sk-ant-...

# Inngest
INNGEST_EVENT_KEY=...
INNGEST_SIGNING_KEY=...

# Auth.js
AUTH_SECRET=...
AUTH_GOOGLE_ID=...
AUTH_GOOGLE_SECRET=...
AUTH_GITHUB_ID=...
AUTH_GITHUB_SECRET=...

# App
NEXT_PUBLIC_APP_URL=https://nda-analyst.vercel.app
```

### Inngest Configuration

| Setting       | Value                                                 |
| ------------- | ----------------------------------------------------- |
| Plan          | Hobby (free tier: 50K step executions/month)          |
| Serve route   | `/api/inngest`                                        |
| Concurrency   | 5 concurrent analyses, 3 concurrent embedding batches |
| Retry policy  | 5 retries with exponential backoff                    |
| Step timeout  | 5 minutes per step                                    |
| Rate limiting | Voyage AI: 300 RPM; Claude: 60 RPM                    |

---

## 18. Cost Estimates

### Per-Document Costs

| Resource                               | Cost       |
| -------------------------------------- | ---------- |
| Voyage AI embeddings (document chunks) | ~$0.01     |
| Claude Sonnet 4.5 (analysis pipeline)  | ~$1.10     |
| Neon storage (marginal)                | ~$0.001    |
| Inngest steps (~10 per analysis)       | Free tier  |
| **Total per document**                 | **~$1.11** |

### Monthly Infrastructure (Estimated at 100 documents/month)

| Resource                         | Plan          | Monthly Cost    |
| -------------------------------- | ------------- | --------------- |
| Vercel                           | Pro           | $20             |
| Neon (shared reference + tenant) | Free tier     | $0              |
| Inngest                          | Hobby         | $0              |
| Voyage AI                        | Pay-as-you-go | ~$13            |
| Claude API                       | Pay-as-you-go | ~$110           |
| **Total**                        |               | **~$143/month** |

### Bootstrap Pipeline (One-Time)

| Resource                                | Cost      |
| --------------------------------------- | --------- |
| Voyage AI embeddings (~100M tokens)     | ~$12      |
| Inngest step executions (~5K)           | Free tier |
| Neon storage (~33K vectors × 1024 dims) | Free tier |
| **Total one-time**                      | **~$12**  |

---

## 19. Milestones and Roadmap

### Week 1: Foundation + Data Pipeline

**Deliverables:**

- Project scaffolding: Next.js 16, Drizzle, Neon, Inngest, Auth.js, shadcn/ui
- CLAUDE.md and .cursor/rules for AI-assisted development
- Drizzle schema for both shared reference and tenant databases
- Inngest bootstrap pipeline: download, parse, embed, and store CUAD + ContractNLI
- Bonterms and CommonAccord template parsing and storage
- HNSW index creation post-load
- Basic auth flow (Google OAuth)
- Verify: `SELECT * FROM reference_embeddings LIMIT 10` returns populated vectors

### Week 2: Upload + Clause Extraction Agent

**Deliverables:**

- Document upload UI (drag-and-drop, progress, status)
- PDF and DOCX text extraction
- Document chunking with legal-section-aware splitting
- Voyage AI embedding generation for user documents
- Inngest analysis pipeline: Parser Agent + Classifier Agent
- Clause extraction stored in `clause_extractions` table
- Analysis view UI: document preview + clause list with categories
- Verify: upload an NDA, see clause-by-clause extraction within 90 seconds

### Week 3: Risk Analysis + Gap Detection

**Deliverables:**

- Risk Scorer Agent: per-clause risk assessment with evidence
- Gap Analyst Agent: missing category detection with recommendations
- Two-database merge retrieval (reference + tenant context)
- Risk gauge component and evidence expandable sections
- Gap analysis section in analysis view
- Overall risk score calculation and display
- Verify: known-risky NDA correctly flagged; standard NDA scores low risk

### Week 4: Comparison + Generation + Polish

**Deliverables:**

- NDA comparison: clause alignment, side-by-side view, difference summary
- NDA generation: parameter form, template selection, preview, DOCX export
- Dashboard with document list, stats, recent analyses
- Responsive design pass (mobile-friendly)
- Error handling, loading states, empty states
- Legal disclaimers on all output
- README, deployment docs, open-source license
- Production deploy to Vercel
- Verify: full end-to-end demo flow (upload → analyze → compare → generate)

### Post-MVP Backlog

- ContractNLI 17-hypothesis NLI scoring
- Batch document analysis with portfolio dashboard
- Custom clause library for generation
- PDF export of analysis reports
- API access with key management
- Team/workspace management with RBAC
- Real-time analysis status via Server-Sent Events or WebSocket
- i18n (contract analysis in non-English jurisdictions)

---

## 20. Technical Decision Log

Architectural Decision Records (ADRs) documenting rationale for key choices.

### ADR-001: Drizzle ORM Over Prisma

**Decision:** Use Drizzle ORM instead of Prisma for all database operations.

**Context:** Both ORMs support PostgreSQL and have Next.js integrations. The project requires native pgvector operations for similarity search.

**Rationale:**

- Drizzle has native `vector()` column type with proper TypeScript inference (`number[]`)
- Drizzle provides typed distance functions: `cosineDistance()`, `l2Distance()`, `innerProduct()`
- Drizzle supports schema-declared HNSW indexes
- Bundle size: 7kb (Drizzle) vs 1.6MB (Prisma)
- Prisma's `Unsupported("vector")` type infers as `never`, requiring raw SQL for all vector operations
- Prisma's `createMany` not generated for models with `Unsupported` fields
- Prisma may drop HNSW indexes during migrations (schema drift)

**Trade-offs:**

- Less LLM training data for Drizzle (mitigated by CLAUDE.md context files and `llms-full.txt`)
- No nested creates (use transactions)
- No built-in middleware (use wrapper functions)

### ADR-002: Inngest Over Raw Scripts for Bootstrap Pipeline

**Decision:** Use Inngest for the one-time data bootstrap pipeline rather than a simple Node.js script.

**Context:** The bootstrap pipeline processes ~1,200 documents through rate-limited embedding APIs.

**Rationale:**

- Automatic resume from failure point (e.g., fails at document 300 of 607, resumes from 301)
- Built-in rate limiting and concurrency control for Voyage AI API
- Idempotent by design (safe re-runs without duplicates)
- Dashboard visibility into pipeline progress
- Extra code overhead: only ~15-20% over raw script
- Same Inngest infrastructure reused for runtime analysis pipeline

### ADR-003: Voyage AI voyage-law-2 for Embeddings

**Decision:** Use Voyage AI's `voyage-law-2` model instead of OpenAI `text-embedding-3-large` or other general-purpose models.

**Context:** The system performs semantic search over legal documents for clause matching and risk assessment.

**Rationale:**

- Voyage-law-2 is specifically trained on legal text corpora
- Benchmarked significantly higher on legal retrieval tasks than general-purpose models
- 1024 dimensions (vs 3072 for OpenAI large) reduces storage and query cost
- 16K token context window handles long legal sections without truncation
- $0.12/M tokens pricing is competitive

### ADR-004: Two-Tier Data Architecture

**Decision:** Separate shared reference database from tenant-scoped data.

**Context:** Reference corpora (CUAD, ContractNLI, templates) are read-only and identical for all users.

**Rationale:**

- Eliminates redundant storage of ~33K reference vectors per tenant
- Shared DB requires no RLS, simplifying queries and improving performance
- Tenant DB can evolve independently (schema changes don't affect reference data)
- Clear separation of bootstrap pipeline (Tier 1) from runtime operations (Tier 2)
- Post-MVP migration to project-per-tenant only affects Tier 2

### ADR-005: Inngest Wrapping LangGraph.js (Not Replacing)

**Decision:** Use Inngest for durable orchestration at the pipeline level, LangGraph.js for agent-internal state management.

**Context:** Both Inngest (AgentKit) and LangGraph.js can orchestrate AI agents.

**Rationale:**

- Inngest provides durability (retry, resume, rate limiting) — missing from LangGraph.js alone
- LangGraph.js provides fine-grained state graphs with tool routing — missing from Inngest's step model
- Pattern: each LangGraph agent runs inside an `inngest step.run()` call
- Inngest handles inter-agent coordination; LangGraph handles intra-agent state
- LangGraph checkpointing within a step is redundant (Inngest retries the whole step) but harmless

### ADR-006: Shared Database + RLS for MVP Multi-Tenancy

**Decision:** Use a single shared database with Row-Level Security for MVP, with project-per-tenant as a post-MVP option.

**Context:** The system needs tenant data isolation for user-uploaded legal documents.

**Rationale:**

- Simplest deployment model for MVP (single connection string, single migration target)
- RLS provides PostgreSQL-native isolation at the row level
- Drizzle 0.36+ has native `pgPolicy` and `crudPolicy` APIs for schema-declared RLS
- Application-layer tenant filtering provides defense-in-depth
- Migration path to project-per-tenant is well-documented by Neon
- Scale-to-zero economics make project-per-tenant viable for post-MVP

---

## 21. Risks and Mitigations

| Risk                                            | Likelihood | Impact   | Mitigation                                                                                                                |
| ----------------------------------------------- | ---------- | -------- | ------------------------------------------------------------------------------------------------------------------------- |
| **Claude API rate limits during bulk analysis** | Medium     | High     | Inngest step-level throttling (60 RPM); queue with backpressure                                                           |
| **Voyage AI model deprecation**                 | Low        | High     | Abstract embedding calls behind an interface; migration to successor model is config change                               |
| **CUAD dataset quality issues**                 | Low        | Medium   | Validate annotations during bootstrap; flag and skip malformed entries                                                    |
| **Hallucinated risk assessments**               | Medium     | High     | Every assessment requires cited evidence from reference corpus; include confidence scores; legal disclaimer on all output |
| **Cross-tenant data leak via RLS bypass**       | Low        | Critical | Defense-in-depth: RLS + application-layer WHERE + integration tests verifying isolation                                   |
| **Inngest free tier exhaustion**                | Medium     | Low      | Monitor step execution counts; upgrade to Pro ($75/month) if approaching 50K/month                                        |
| **Next.js 16 breaking changes**                 | Medium     | Medium   | Pin exact versions; Vercel preview deploys catch issues before production                                                 |
| **Neon cold start latency**                     | Medium     | Low      | Use pooled connections; first request may be slow (~500ms), subsequent requests fast                                      |
| **Legal liability from AI-generated NDAs**      | Low        | High     | Prominent disclaimers; no claim of legal advice; generated documents marked as drafts requiring attorney review           |

---

## 22. Open Questions

1. **File storage:** Should raw uploaded files be stored in the database (as `bytea`) or in object storage (Vercel Blob, S3)? Database simplifies the stack but increases Neon storage. Decision needed before Week 2.

2. **Real-time status updates:** Should analysis progress use polling (simpler) or Server-Sent Events (better UX)? Polling is MVP-appropriate; SSE is a clear post-MVP improvement.

3. **Embedding model versioning:** If Voyage AI releases voyage-law-3, how do we handle the migration? Options: re-embed everything (costly but clean), run dual indexes (complex but gradual), or freeze on v2 until forced.

4. **ContractNLI integration depth:** Should ContractNLI NLI scoring be per-clause or per-document? Per-clause is more granular but requires ~17× more LLM calls. Decision deferred to Week 3 implementation.

5. **Export format for analysis reports:** PDF (polished, fixed layout) vs. DOCX (editable, integrates with legal workflows) vs. both? Sarah persona suggests DOCX is higher priority.

6. **Clause alignment algorithm:** Hungarian algorithm (optimal but O(n³)) vs. greedy matching (faster, potentially suboptimal)? Need to benchmark with real data in Week 4.

7. **Monetization path (if any):** Current scope is non-commercial open source. If demand warrants, potential paths include: hosted version with usage-based pricing, enterprise self-hosted license, or consulting/integration services.

---

## 23. Appendices

### Appendix A: CUAD 41-Category Taxonomy

1. Document Name, 2. Parties, 3. Agreement Date, 4. Effective Date, 5. Expiration Date, 6. Renewal Term, 7. Notice Period to Terminate Renewal, 8. Governing Law, 9. Most Favored Nation, 10. Non-Compete, 11. Exclusivity, 12. No-Solicit of Customers, 13. Competitive Restriction Exception, 14. No-Solicit of Employees, 15. Non-Disparagement, 16. Termination for Convenience, 17. ROFR/ROFO/ROFN, 18. Change of Control, 19. Anti-Assignment, 20. Revenue/Profit Sharing, 21. Price Restrictions, 22. Minimum Commitment, 23. Volume Restriction, 24. IP Ownership Assignment, 25. Joint IP Ownership, 26. License Grant, 27. Non-Transferable License, 28. Affiliate License, 29. Unlimited/All-You-Can-Eat License, 30. Irrevocable or Perpetual License, 31. Source Code Escrow, 32. Post-Termination Services, 33. Audit Rights, 34. Uncapped Liability, 35. Cap on Liability, 36. Liquidated Damages, 37. Warranty Duration, 38. Insurance, 39. Covenant Not to Sue, 40. Third Party Beneficiary, 41. Undefined

### Appendix B: ContractNLI 17 Hypotheses

1. Explicit identification of confidential information, 2. Standard definition of confidential information, 3. Obligation to protect confidential information, 4. Use of confidential information restricted to stated purpose, 5. Prohibition on sharing confidential information with third parties, 6. Sharing with employees or agents under similar obligations, 7. Notice of compelled disclosure, 8. Return or destruction of confidential information, 9. No non-competition obligation, 10. No solicitation restriction, 11. Survival of obligations after termination, 12. Permissible independent development, 13. Receiving party acknowledges no warranty, 14. No obligation to disclose, 15. Remedies for breach include equitable relief, 16. No implied agency or partnership, 17. Governing law specified

### Appendix C: Project File Structure

```
nda-analyst/
├── CLAUDE.md                           # Claude Code project memory
├── README.md                           # Project overview and setup
├── package.json
├── pnpm-lock.yaml
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── drizzle.config.ts                   # Drizzle Kit configuration
├── .env.local                          # Local environment variables
├── .env.example                        # Template for required env vars
├── .claude/
│   └── rules/
│       ├── database.md                 # Drizzle conventions
│       ├── api-routes.md               # API patterns
│       └── testing.md                  # Test requirements
├── app/
│   ├── layout.tsx                      # Root layout with providers
│   ├── page.tsx                        # Landing page
│   ├── api/
│   │   ├── inngest/route.ts            # Inngest serve handler
│   │   ├── documents/
│   │   ├── analyses/
│   │   ├── comparisons/
│   │   └── generate/
│   ├── (auth)/
│   │   ├── sign-in/page.tsx
│   │   └── sign-up/page.tsx
│   └── (dashboard)/
│       ├── layout.tsx                  # Dashboard shell with nav
│       ├── page.tsx                    # Dashboard home
│       ├── documents/
│       │   ├── page.tsx                # Document list
│       │   ├── [id]/page.tsx           # Document detail / analysis view
│       │   └── actions.ts              # Server actions
│       ├── compare/
│       │   ├── page.tsx                # Comparison setup
│       │   └── [id]/page.tsx           # Comparison results
│       └── generate/
│           ├── page.tsx                # Generation wizard
│           └── [id]/page.tsx           # Generated NDA preview
├── src/
│   ├── db/                             # Database layer (see §11)
│   ├── inngest/
│   │   ├── client.ts                   # Inngest client instance
│   │   └── functions/
│   │       ├── bootstrap.ts            # Bootstrap pipeline
│   │       ├── analyze.ts              # Analysis pipeline
│   │       ├── compare.ts              # Comparison pipeline
│   │       └── generate.ts             # Generation pipeline
│   ├── agents/
│   │   ├── parser.ts                   # Parser Agent (LangGraph)
│   │   ├── classifier.ts              # Classifier Agent
│   │   ├── risk-scorer.ts             # Risk Scorer Agent
│   │   └── gap-analyst.ts             # Gap Analyst Agent
│   ├── lib/
│   │   ├── auth.ts                     # Auth.js configuration
│   │   ├── embeddings.ts              # Voyage AI client
│   │   ├── chunker.ts                 # Legal-aware text chunking
│   │   ├── claude.ts                   # Claude API client wrapper
│   │   └── tenant-context.ts          # AsyncLocalStorage tenant scoping
│   └── components/
│       ├── ui/                         # shadcn/ui components (customized)
│       ├── document-upload.tsx
│       ├── clause-card.tsx
│       ├── risk-gauge.tsx
│       ├── comparison-view.tsx
│       └── generation-wizard.tsx
├── docs/
│   ├── PRD.md                          # This document
│   ├── embedding-strategy.md
│   ├── api-patterns.md
│   └── SCHEMA_REFERENCE.md            # Auto-generated schema docs
├── drizzle/                            # Generated migration files
├── test/
│   ├── setup.ts                        # PGLite test database
│   ├── fixtures/                       # Test NDAs and golden outputs
│   ├── unit/
│   ├── integration/
│   └── e2e/
└── scripts/
    └── bootstrap.ts                    # Manual bootstrap trigger
```

### Appendix D: Key External Documentation

| Resource                | URL                                                   |
| ----------------------- | ----------------------------------------------------- |
| Drizzle ORM docs        | https://orm.drizzle.team/docs                         |
| Drizzle pgvector guide  | https://orm.drizzle.team/docs/extensions/pg#pg_vector |
| Drizzle RLS docs        | https://orm.drizzle.team/docs/rls                     |
| Drizzle AI context file | https://orm.drizzle.team/llms-full.txt                |
| Neon multi-tenancy      | https://neon.com/docs/guides/multitenancy             |
| Neon RLS + Drizzle      | https://neon.com/docs/guides/rls-drizzle              |
| Inngest docs            | https://www.inngest.com/docs                          |
| Inngest AgentKit        | https://agentkit.inngest.com/overview                 |
| Voyage AI docs          | https://docs.voyageai.com                             |
| CUAD dataset            | https://github.com/TheAtticusProject/cuad             |
| ContractNLI             | https://stanfordnlp.github.io/contract-nli/           |
| Bonterms Mutual NDA     | https://github.com/Bonterms/Mutual-NDA                |
| CommonAccord NW-NDA     | https://github.com/CommonAccord/NW-NDA                |
| Claude API docs         | https://docs.anthropic.com/en/docs                    |

---

_This PRD is a living document. Update as architectural decisions evolve during implementation._
