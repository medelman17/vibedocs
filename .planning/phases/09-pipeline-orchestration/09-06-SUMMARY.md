---
phase: 09-pipeline-orchestration
plan: 06
subsystem: testing
tags: [sample-ndas, test-data, legal-text, pipeline-testing]

# Dependency graph
requires:
  - phase: 09-pipeline-orchestration
    provides: "Pipeline stages for classifier (Plan 03), risk scorer (Plan 04)"
provides:
  - "Three built-in sample NDAs for pipeline testing (short, standard, complex)"
  - "SampleNDA type interface with metadata and expected clause counts"
  - "SAMPLE_NDAS array for iteration"
affects:
  - phase: 09-pipeline-orchestration
    plan: 07
    reason: "E2E pipeline tests can use sample NDAs directly"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Typed test data constants with expected outcomes for validation"

# File tracking
key-files:
  created:
    - lib/sample-ndas/index.ts
    - lib/sample-ndas/short-nda.ts
    - lib/sample-ndas/standard-nda.ts
    - lib/sample-ndas/complex-nda.ts
  modified: []

# Decisions
decisions:
  - id: "sample-nda-complexity-range"
    choice: "Three tiers: short (~6 clauses), standard (~12), complex (~22)"
    reason: "Covers full range of real-world NDA complexity for testing"

# Metrics
metrics:
  duration: "4 min"
  completed: "2026-02-05"
  tasks_completed: 2
  tasks_total: 2
---

# Phase 09 Plan 06: Sample NDAs for Pipeline Testing Summary

Built-in sample NDA test data with realistic legal text covering three complexity tiers for one-click pipeline testing.

## What Was Done

### Task 1: Sample NDA Type and Short NDA
- Defined `SampleNDA` interface with `id`, `title`, `description`, `complexity`, `rawText`, `expectedClauseCount`, `expectedCategories`
- Created short mutual NDA (~3.5KB text) with 6 sections: confidential info definition, non-disclosure obligations, term/termination, return of materials, governing law, entire agreement
- Set up barrel export in `index.ts` with `SAMPLE_NDAS` array
- Commit: `166cd8e`

### Task 2: Standard and Complex Sample NDAs
- Created standard bilateral NDA (~8.4KB text) with 12 expected clauses: non-compete, non-solicitation, IP ownership assignment, indemnification, limitation of liability, notice provisions, amendment, jurisdiction
- Created complex multi-party NDA (~9.2KB text) with 22 expected clauses: three parties, tiered confidentiality (standard vs highly confidential), audit rights, insurance requirements, change of control, revenue/profit sharing, license grant, non-transferable license, most favored nation, liquidated damages, warranty duration, post-termination services, competitive restriction exception
- Both use realistic legal language with ARTICLE/Section numbering pattern
- Commit: `75f1fa7`

## Deviations from Plan

None - plan executed exactly as written.

## Decisions Made

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Complex NDA text size | ~9.2KB (within 10KB target) | Condensed verbose sections while keeping all 22 CUAD category triggers |

## Verification Results

- `pnpm lint` (eslint on sample-ndas/): passes clean
- `SAMPLE_NDAS` array: 3 entries confirmed via tsx execution
- All samples have realistic legal language (proper section numbering, defined terms, standard NDA clauses)
- Each sample includes `expectedClauseCount` and `expectedCategories`
- File sizes: short 4KB, standard 9.3KB, complex 10.4KB (~25KB total TypeScript files)

## Output Files

| File | Purpose | Size |
|------|---------|------|
| `lib/sample-ndas/index.ts` | SampleNDA type + barrel export + SAMPLE_NDAS array | 1.2KB |
| `lib/sample-ndas/short-nda.ts` | Simple mutual NDA (2 parties, 6 clauses) | 4KB |
| `lib/sample-ndas/standard-nda.ts` | Bilateral NDA with restrictive covenants (12 clauses) | 9.3KB |
| `lib/sample-ndas/complex-nda.ts` | Multi-party NDA with full CUAD coverage (22 clauses) | 10.4KB |

## Next Phase Readiness

Sample NDAs ready for use in Plan 07 (E2E pipeline integration tests) and any future pipeline debugging.
