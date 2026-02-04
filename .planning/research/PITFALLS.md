# Domain Pitfalls: LLM Agent Pipelines

**Domain:** Multi-agent LLM pipeline for NDA analysis (Inngest + AI SDK 6)
**Researched:** 2026-02-04
**Confidence:** MEDIUM (WebSearch-verified with official docs, cross-referenced with codebase)

---

## Critical Pitfalls

Mistakes that cause rewrites, data corruption, or complete pipeline failure.

---

### Pitfall 1: Cascading Error Propagation

**What goes wrong:** A single misclassification or parsing error in an early agent (Parser/Classifier) propagates through subsequent agents, causing the entire analysis to be wrong. The Risk Scorer builds on faulty classifications; the Gap Analyst misses clauses that were never extracted.

**Why it happens:** Each agent assumes its input is correct. Early-stage failures compound at each step. Research shows "early mistakes rarely remain confined; instead, they cascade into subsequent steps, distorting reasoning, compounding misjudgments, and ultimately derailing the entire trajectory" ([Where LLM Agents Fail](https://arxiv.org/abs/2509.25370)).

**Consequences:**
- User receives confident but wrong risk assessments
- Missing clauses never flagged in gap analysis
- No indication that early failure occurred
- Evidence citations point to wrong clauses

**Prevention:**
1. **Confidence thresholds per agent:** Skip or flag low-confidence outputs before passing downstream
2. **Early validation gates:** Classifier should verify Parser output structure; Risk Scorer should validate clause existence
3. **Output lineage tracking:** Each output should reference its input IDs for debugging
4. **Sanity checks:** If Classifier produces 0 clauses or Parser produces 0 chunks, halt pipeline early

**Detection:**
- Unusually low clause count (< 5 for a multi-page NDA)
- All clauses classified as "Unknown"
- Gap analysis shows all 41 categories missing
- Processing time abnormally short

**Phase to address:** Foundation (agent architecture phase)
- Implement validation between each step.run()
- Add minimum output thresholds before proceeding

**Confidence:** HIGH (documented pattern in multi-agent research, observed in codebase review)

---

### Pitfall 2: Hallucinated Evidence Citations

**What goes wrong:** The Risk Scorer generates confident risk assessments with citations that don't exist or don't support the claim. Users trust the cited evidence, but the citation is fabricated or misattributed.

**Why it happens:** RAG systems with legal documents hallucinate 17-33% of the time ([Legal RAG Hallucinations](https://dho.stanford.edu/wp-content/uploads/Legal_RAG_Hallucinations.pdf)). LLMs generate plausible-sounding citations without verifying the source exists in the retrieved context.

**Consequences:**
- Legal professionals make decisions based on non-existent precedent
- User loses trust when they discover citation is wrong
- Potential liability if user relies on fabricated evidence
- Undermines entire value proposition of "evidence-grounded" analysis

**Prevention:**
1. **Citation verification loop:** After generation, verify each citation ID exists in the actual retrieval results
2. **Constrained generation:** Only allow citations from explicitly provided reference IDs in the prompt
3. **Structural separation:** Citations should be structured data (reference IDs), not free-text strings
4. **Post-hoc consistency check:** Compare generated text against retrieved evidence semantically

**Detection:**
- Citation IDs that don't match any reference document
- Statistics cited (e.g., "78% of NDAs...") that weren't in the RAG context
- Evidence.citations array contains text not present in any reference

**Phase to address:** Risk Scorer implementation
- Schema should require citations as reference IDs, not strings
- Add post-generation citation validation step

**Confidence:** HIGH (documented hallucination rates in legal RAG research)

---

### Pitfall 3: Token Budget Explosion

**What goes wrong:** A single unusually long NDA (50+ pages) or malformed document causes token usage to explode, exhausting the ~212K budget or hitting API rate limits mid-pipeline.

**Why it happens:** Current implementation processes all chunks in sequence without budget guards. The BudgetTracker records usage but doesn't enforce limits. One 100-page contract could consume 500K+ tokens.

**Consequences:**
- $5-10 cost for a single analysis (vs expected $1.10)
- Pipeline fails mid-execution, leaving partial results
- Rate limit errors cause retries, compounding costs
- Inngest retries may multiply the cost

**Prevention:**
1. **Pre-flight budget estimation:** Before running, estimate token count from document size
2. **Chunk limiting:** Cap maximum chunks per document (e.g., 30 chunks)
3. **Adaptive chunking:** For long documents, use larger chunks with higher overlap
4. **Hard budget enforcement:** Abort pipeline if BudgetTracker.isExceeded before each agent
5. **Document size validation:** Reject documents > 50 pages at upload time

**Detection:**
- BudgetTracker.isWarning (80% threshold) triggered early
- Single analysis takes > 2 minutes
- Processing time exceeds 90-second target significantly

**Phase to address:** Parser Agent + Upload validation
- Add document size limits at upload
- Implement budget checks between each step.run()

**Confidence:** HIGH (codebase shows BudgetTracker exists but doesn't enforce limits)

---

### Pitfall 4: Inngest Step Non-Idempotency

**What goes wrong:** When a step fails and Inngest retries, side effects occur multiple times. Database inserts create duplicate records. Progress events fire repeatedly. External API calls are made again.

**Why it happens:** Code inside step.run() may not be idempotent. Inngest's durable execution model means any step can retry at any time. From [Inngest docs](https://www.inngest.com/docs/guides/handling-idempotency): "Re-running a step upon error requires its code to be idempotent."

**Consequences:**
- Duplicate clause_extractions records
- Multiple analysis records for same document
- Duplicate embeddings stored
- Progress events fire multiple times (confusing UI)

**Prevention:**
1. **Use upsert patterns:** `ON CONFLICT DO UPDATE` instead of INSERT
2. **Idempotency keys:** Pass unique IDs to external APIs that support them
3. **Check-before-write:** Query for existing record before inserting
4. **Step return values:** Return IDs from early steps, use them in later steps to avoid re-creation

**Detection:**
- Duplicate records in analyses table for same document
- Multiple progress events with same stage/progress values
- Embedding count higher than expected for document

**Phase to address:** Foundation (Inngest patterns)
- Review all step.run() calls for idempotency
- Use upsert for all database writes

**Confidence:** HIGH (documented Inngest requirement, codebase uses INSERT not upsert)

---

### Pitfall 5: generateObject Deprecation and Migration Gaps

**What goes wrong:** The codebase uses `generateObject` which is deprecated in AI SDK 6. Future updates may break the pipeline. Schema validation may fail silently or produce malformed output.

**Why it happens:** AI SDK 6 deprecated `generateObject` and `streamObject` in favor of `generateText`/`streamText` with `output` property. The migration isn't just API changes - error handling and retry behavior differs.

**Consequences:**
- Future AI SDK updates may break all agents
- Schema validation errors may not surface properly
- Tool calling is not available with generateObject
- Inconsistent behavior across different model providers

**Prevention:**
1. **Migrate to generateText with output:** Use the new pattern before deprecated APIs are removed
2. **Pin AI SDK version:** Lock to current version until migration complete
3. **Add explicit schema validation:** Validate output matches schema before using
4. **Handle AI_NoObjectGeneratedError:** Add specific error handling for schema failures

**Detection:**
- Deprecation warnings in build output
- Schema validation errors in production logs
- Malformed JSON responses from agents

**Phase to address:** Agent implementation (all agents)
- Plan migration to generateText with output property
- Add schema validation error handling

**Confidence:** HIGH (official AI SDK 6 documentation confirms deprecation)

---

## Moderate Pitfalls

Mistakes that cause delays, technical debt, or degraded quality.

---

### Pitfall 6: PDF/DOCX Extraction Silent Failures

**What goes wrong:** Scanned PDFs, encrypted documents, or malformed DOCX files extract as empty or garbage text. The pipeline proceeds with unusable content, producing meaningless analysis.

**Why it happens:** pdf-parse and mammoth silently fail on certain document types. Scanned PDFs have no text layer. Some PDFs are image-only. DOCX with embedded objects may lose content.

**Consequences:**
- Analysis runs on empty/garbage content
- User charged for worthless analysis
- No clauses extracted, gap analysis shows everything missing
- Support tickets for "analysis doesn't work"

**Prevention:**
1. **Extraction validation:** Check extracted text length vs file size ratio
2. **Minimum text threshold:** Require at least 500 characters of extracted text
3. **OCR fallback:** For image-based PDFs, use OCR service (Tesseract, Cloud Vision)
4. **Format detection:** Detect scanned PDFs before attempting text extraction
5. **User notification:** Alert user if document quality is poor

**Detection:**
- Extracted text < 500 characters for multi-page document
- High ratio of non-ASCII characters
- No sentence boundaries detected in text
- File size > 1MB but text < 1KB

**Phase to address:** Parser Agent
- Add extraction validation
- Consider OCR integration for scanned documents

**Confidence:** MEDIUM (common industry issue, needs validation with real documents)

---

### Pitfall 7: Rate Limit Handling Gaps

**What goes wrong:** Voyage AI or Claude returns 429 (rate limit) errors, but retry logic doesn't properly back off. Pipeline gets stuck in retry loops or fails entirely.

**Why it happens:** Current implementation uses step.sleep() between calls but doesn't handle actual 429 responses dynamically. Rate limits can spike unexpectedly during high-volume periods.

**Consequences:**
- Pipeline fails after exhausting retries
- Wasted Inngest step executions
- User waits indefinitely for stuck analysis
- May hit Inngest's 50K steps/month free tier limit

**Prevention:**
1. **Respect Retry-After header:** Parse 429 response for suggested delay
2. **Exponential backoff:** Increase delay on repeated failures
3. **Circuit breaker:** After N failures, fail fast instead of retrying
4. **Rate limit pooling:** Track rate limits across concurrent analyses

**Detection:**
- 429 errors in logs
- Analyses stuck in "processing" state > 5 minutes
- Inngest dashboard shows repeated retries for same step

**Phase to address:** Inngest infrastructure
- Enhance ApiError handling for rate limits
- Add dynamic backoff based on Retry-After

**Confidence:** MEDIUM (implementation exists but may not handle all cases)

---

### Pitfall 8: Vector Search Relevance Drift

**What goes wrong:** Similar clause retrieval returns irrelevant results because embeddings don't capture legal nuance. Classifier gets bad few-shot examples, producing incorrect classifications.

**Why it happens:** Voyage AI voyage-law-2 is trained on legal text but may not capture NDA-specific semantics. Similarity threshold (0.5 cosine distance) may be too permissive. Reference corpus may have quality issues.

**Consequences:**
- Few-shot examples mislead the classifier
- Risk assessments based on irrelevant comparisons
- Evidence citations point to unrelated clauses
- Inconsistent results across similar documents

**Prevention:**
1. **Category-scoped search:** Filter vector search by expected category when known
2. **Re-ranking:** Use cross-encoder to re-rank initial vector search results
3. **Threshold tuning:** Test and tune similarity threshold with real NDAs
4. **Result validation:** Verify retrieved clauses are actually relevant before using

**Detection:**
- Manual review shows few-shot examples are irrelevant
- Same document produces different results on re-analysis
- Users report nonsensical comparisons in evidence

**Phase to address:** Classifier Agent + vector search tuning
- Add category filtering to vector search
- Consider re-ranking step

**Confidence:** MEDIUM (theoretical risk, needs validation with real usage data)

---

### Pitfall 9: Progress State Inconsistency

**What goes wrong:** Progress tracking gets out of sync with actual pipeline state. UI shows "90% complete" but pipeline failed. Or shows "analyzing" when already complete.

**Why it happens:** Progress updates are in separate step.run() calls from actual work. If work fails after progress update, state is inconsistent. Progress persisted to DB may not match actual Inngest function state.

**Consequences:**
- User confused by incorrect progress
- No indication of failure until timeout
- Difficult to debug production issues
- Support escalations for "stuck" analyses

**Prevention:**
1. **Atomic progress updates:** Update progress in same transaction as work
2. **Status reconciliation:** Background job to sync DB status with Inngest state
3. **Timeout handling:** Auto-mark analyses as failed if no progress for 10 minutes
4. **Clear error states:** If any step fails, immediately update status to "failed"

**Detection:**
- Analysis status "processing" for > 10 minutes
- Progress percentage doesn't increase over time
- UI shows success but no results available

**Phase to address:** Inngest infrastructure
- Review progress update patterns
- Add timeout detection and recovery

**Confidence:** MEDIUM (potential issue based on current architecture)

---

## Minor Pitfalls

Mistakes that cause annoyance but are fixable without major rework.

---

### Pitfall 10: Inconsistent Confidence Thresholds

**What goes wrong:** Different agents use different confidence thresholds. Classifier filters at 0.5, Risk Scorer has no filter. This creates inconsistent behavior across the pipeline.

**Why it happens:** Each agent was implemented independently without shared threshold configuration. No central policy for handling low-confidence outputs.

**Prevention:**
1. **Shared threshold configuration:** Define thresholds in central config
2. **Consistent low-confidence handling:** All agents should handle uncertain outputs the same way

**Phase to address:** Agent implementation refinement

**Confidence:** HIGH (observable in codebase)

---

### Pitfall 11: step.run Variable Scoping

**What goes wrong:** Variables assigned outside step.run() are undefined in later steps because steps don't share runtime context.

**Why it happens:** Inngest's durable execution model runs each step as a separate HTTP request. State must be explicitly returned and passed. From [Inngest docs](https://www.inngest.com/docs/guides/multi-step-functions): "step.run() only runs once and is skipped for future steps, so variables assigned outside the step won't be defined."

**Prevention:**
1. **Always return data from step.run():** Don't rely on closure variables
2. **Pass state explicitly:** Use step return values as input to next step

**Phase to address:** Foundation (code review)

**Confidence:** HIGH (documented Inngest behavior)

---

### Pitfall 12: Barrel Export Landmines

**What goes wrong:** Adding new agent exports to barrel files (index.ts) can pull in heavy dependencies, causing production crashes due to browser-only modules.

**Why it happens:** Production builds eagerly evaluate entire module graphs. Import chains can unexpectedly include pdf-parse or other Node-specific modules. CLAUDE.md documents this: "Barrel exports cause production crashes because production builds evaluate entire module graphs at startup."

**Prevention:**
1. **Avoid barrel exports for agents:** Import directly from agent files
2. **Keep heavy dependencies isolated:** Never export from barrel files

**Phase to address:** Already documented in CLAUDE.md, follow existing convention

**Confidence:** HIGH (documented in project, Issue #43)

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation | Priority |
|-------------|---------------|------------|----------|
| Parser Agent | PDF extraction failures | Add validation, OCR fallback | High |
| Classifier Agent | Bad few-shot examples | Category-scoped vector search | Medium |
| Risk Scorer Agent | Hallucinated citations | Citation verification loop | Critical |
| Gap Analyst Agent | False positives from bad classification | Validate input clause count | Medium |
| Inngest Pipeline | Step non-idempotency | Use upsert patterns | High |
| Budget Tracking | Cost explosion | Pre-flight estimation, hard limits | High |
| Progress Updates | State inconsistency | Atomic updates, timeout handling | Medium |
| AI SDK Migration | generateObject deprecation | Plan migration to generateText | Medium |
| Vector Search | Relevance drift | Threshold tuning, re-ranking | Low |

---

## Actionable Checklist for Each Phase

### Foundation Phase
- [ ] Review all step.run() calls for idempotency
- [ ] Implement upsert patterns for database writes
- [ ] Add validation gates between pipeline steps
- [ ] Configure shared confidence thresholds

### Parser Agent Phase
- [ ] Add extraction validation (min text length, quality checks)
- [ ] Implement document size limits at upload
- [ ] Add pre-flight token budget estimation

### Classifier Agent Phase
- [ ] Add category-scoped vector search
- [ ] Implement minimum clause count validation
- [ ] Handle edge case of zero chunks

### Risk Scorer Phase
- [ ] Implement citation verification loop
- [ ] Change evidence.citations to reference IDs, not strings
- [ ] Add budget check before processing

### Gap Analyst Phase
- [ ] Validate input clause count before analysis
- [ ] Handle edge case of no clauses classified

### Integration Phase
- [ ] Plan AI SDK 6 migration (generateObject -> generateText)
- [ ] Add timeout handling for long analyses
- [ ] Implement progress state reconciliation

---

## Sources

### Official Documentation
- [Inngest Error Handling](https://www.inngest.com/docs/guides/error-handling)
- [Inngest Idempotency Guide](https://www.inngest.com/docs/guides/handling-idempotency)
- [AI SDK 6 Migration Guide](https://ai-sdk.dev/docs/migration-guides/migration-guide-6-0)
- [AI SDK generateObject Reference](https://ai-sdk.dev/docs/reference/ai-sdk-core/generate-object)

### Research Papers (MEDIUM confidence - WebSearch verified)
- [Where LLM Agents Fail and How They can Learn From Failures](https://arxiv.org/abs/2509.25370)
- [Legal RAG Hallucinations - Stanford](https://dho.stanford.edu/wp-content/uploads/Legal_RAG_Hallucinations.pdf)
- [Why Multi-Agent LLM Systems Fail](https://arxiv.org/pdf/2503.13657)
- [MEGA-RAG for Mitigating Hallucinations](https://pmc.ncbi.nlm.nih.gov/articles/PMC12540348/)

### Community Resources (LOW confidence - needs validation)
- [Why AI Agent Pilots Fail - Composio](https://composio.dev/blog/why-ai-agent-pilots-fail-2026-integration-roadmap)
- [LLM Cost Optimization - Traceloop](https://www.traceloop.com/blog/from-bills-to-budgets-how-to-track-llm-token-usage-and-cost-per-user)
- [7 AI Agent Failure Modes - Galileo](https://galileo.ai/blog/agent-failure-modes-guide)

### Project-Specific (HIGH confidence - codebase review)
- `/Users/medelman/GitHub/medelman17/vibedocs/CLAUDE.md` - Barrel export documentation
- `/Users/medelman/GitHub/medelman17/vibedocs/inngest/functions/analyze-nda.ts` - Pipeline implementation
- `/Users/medelman/GitHub/medelman17/vibedocs/agents/classifier.ts` - Classifier implementation
- `/Users/medelman/GitHub/medelman17/vibedocs/lib/ai/budget.ts` - Budget tracker (no enforcement)
