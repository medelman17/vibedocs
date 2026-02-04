# Codebase Concerns

**Analysis Date:** 2026-02-04

## Tech Debt

### Email Sending Not Implemented

**Issue:** Password reset emails are never sent to users.

**Files:** `lib/actions/password-reset.ts` (line 17)

**Impact:**
- Users cannot recover forgotten passwords in production
- Development fallback logs tokens to console only
- Affects all non-OAuth sign-ups (email/password auth)

**Fix approach:**
- Import `sendPasswordResetEmail()` from `lib/email.ts`
- Pass token in reset link: `https://app.vibedocs.com/reset-password?token={token}`
- Integrate with Resend or SMTP via `RESEND_API_KEY` env var
- Add queue/retry mechanism for transient failures

---

### Notification System Non-Functional

**Issue:** All notification preference and in-app notification actions return placeholder values. Database tables do not exist.

**Files:** `app/(main)/(dashboard)/settings/notifications/actions.ts` (lines 9-11, 111, 168, 242, 304, 348, 399)

**Impact:**
- Users cannot configure notification preferences (actions silently succeed with defaults)
- No in-app notifications can be sent or retrieved
- Feature appears functional but does nothing
- Future schema addition will require implementation of all 5 database operations

**Fix approach:**
1. Create `notifications` and `notificationPreferences` schema tables in `db/schema/`
2. Implement all 5 commented-out query blocks in order:
   - `getNotificationPreferences()` - Add query to fetch from table
   - `updateNotificationPreferences()` - Add upsert logic
   - `getNotifications()` - Add query with filtering/ordering
   - `markNotificationRead()` - Add update with ownership check
   - `markAllNotificationsRead()` - Batch update by userId
3. Add indexes on userId and timestamp for performance
4. Wire up notification emission from analysis/comparison completion events

---

### Response Cache Placeholder

**Issue:** Response caching is a stub implementation with TODO comments.

**Files:** `lib/cache/response-cache.ts` (lines 22, 29)

**Impact:**
- Cache key generation uses naive substring slicing instead of hashing
- No actual caching behavior (LRU instance created but never used)
- Cache misses cause redundant API calls to Claude
- Reduces cost savings from planned response caching

**Fix approach:**
- Implement `getResponseCacheKey()` to hash prompt + model with SHA-256
- Export cache utility functions: `getCachedResponse()`, `setCachedResponse()`
- Wire into agent pipeline before model.call() in `agents/*.ts`
- Test with fixture of repeated prompts

---

### PDF Export Not Implemented

**Issue:** PDF generation endpoint returns placeholder URLs instead of real PDFs.

**Files:** `app/(main)/(dashboard)/analyses/actions.ts` (lines 722-726)

**Impact:**
- Users cannot download analysis results as PDF reports
- Blocks feature from being production-ready
- Returns fake Vercel Blob URLs
- Impact: Medium (premium feature, workaround: screenshot/browser export)

**Fix approach:**
1. Import `pdf-lib` and PDF generation utilities from `lib/document-export.ts`
2. In `exportAnalysisPdf()`:
   - Fetch full analysis with clauses, gaps, metadata
   - Generate PDF document with title page, clause breakdown, risk summary
   - Upload to Vercel Blob with `folder: "exports"`
   - Return signed URL with 24-hour expiration
3. Add HTML/CSS template for PDF styling
4. Test with various analysis result sizes

---

### Analysis Cancellation Incomplete

**Issue:** Inngest run cancellation is not implemented. Analysis is marked as failed locally but Inngest job continues running.

**Files:** `app/(main)/(dashboard)/analyses/actions.ts` (lines 600-603)

**Impact:**
- Wasted token budget if user cancels large analysis mid-processing
- Inngest still consumes API rate limits for cancelled work
- No way to clean up stopped resources
- Impact: Medium (tokens/rate limits are finite)

**Fix approach:**
- Implement Inngest run cancellation via API
- Use `inngest.cancel(runId)` or Inngest REST API
- Update status to "cancelled" (not "failed") with timestampCancelledAt
- Log cancellation in audit trail
- Test by cancelling analysis and checking Inngest UI

---

## Known Bugs

### Password Reset Race Condition Prevention Unclear

**Issue:** Atomic token consumption prevents double-use, but validation timing is ambiguous.

**Files:** `lib/password-reset.ts` (lines 85-105)

**Behavior:**
- UPDATE query returns no rows if token already used OR doesn't exist OR expired
- Error message "Invalid or already used token" combines three failure modes
- No way for users to distinguish "token doesn't exist" from "already used"

**Workaround:** Works correctly (token cannot be reused), but error messaging is confusing.

**Fix approach:**
- Check token existence first before marking as used
- Return specific error codes: `INVALID_TOKEN`, `ALREADY_USED`, `EXPIRED`
- Update reset-password page to show appropriate UI messages

---

### Parquet Parser Type Coercion Risk

**Issue:** ContractNLI parser casts Parquet fields with `String()` and `Number()` without null-safety checks.

**Files:** `lib/datasets/contractnli-parser.ts` (lines 39-41)

**Behavior:**
```typescript
const premise = normalizeText(String(row.premise ?? ""))  // Missing field → ""
const labelNum = Number(row.label ?? 1)                   // Invalid label → NaN
```

**Impact:**
- Missing premises silently become empty strings and get processed
- Invalid labels default to `1` (not_mentioned) instead of throwing

**Risk:** Low (dataset is well-formed), but silent data corruption possible.

**Fix approach:**
- Validate each field with Zod before processing
- Skip rows with missing required fields (premise, hypothesis)
- Add error counter for malformed rows
- Log warnings for suspicious data

---

## Security Considerations

### File Upload Path Traversal Risk

**Issue:** Blob pathname construction uses user-provided filename without sanitization.

**Files:** `lib/blob.ts` (line 52)

**Code:**
```typescript
const pathname = `${folder}/${uniqueId}/${file.name}`; // file.name from user input
```

**Risk:**
- User could upload file named `../../sensitive/path/shell.sh`
- Vercel Blob would normalize this, but creates audit/logging confusion
- Not a real exploit risk (Vercel Blob is immutable), but violates input validation principle

**Current mitigation:** Vercel Blob normalizes paths and stores file.name as-is (immutable storage).

**Recommendations:**
- Sanitize filename: `file.name.replace(/[^a-z0-9._-]/gi, '_')`
- Store original filename in database metadata instead of pathname
- Verify uploads don't contain path separators

---

### OAuth Code Cache Expiration

**Issue:** Word Add-in auth codes expire after 60 seconds, but no timeout protection if network fails.

**Files:** `lib/auth-code-cache.ts` (lines 35-36, 50-64)

**Behavior:**
- Code generated and stored in Redis with 60-second TTL
- If taskpane doesn't send code within 60s, exchange endpoint returns null
- No retry logic or user feedback

**Risk:** Low (60s is reasonable for sync auth flow), but UX could be poor on slow networks.

**Recommendations:**
- Extend TTL to 5 minutes for slow connections
- Return meaningful error from `/exchange` route: `CODE_EXPIRED` vs `CODE_INVALID`
- Add taskpane error handling to prompt re-auth if code expired
- Track exchange timeouts in metrics

---

### Tenant Isolation via tenantId

**Issue:** RLS (Row-Level Security) is not actually enforced at database level; isolation relies on application-level tenantId checking.

**Files:** `db/_columns.ts`, `db/queries/*.ts` (all queries)

**Behavior:**
- Every query manually includes `and(eq(analyses.tenantId, tenantId))`
- If developer forgets tenantId check in a query, data leaks across tenants
- No database constraint prevents it

**Risk:** Medium (high-impact if bug occurs, but carefully documented in CLAUDE.md)

**Current mitigation:**
- DAL enforces tenantId capture: `await withTenant()`
- All queries checked during code review
- `verifySession()` ensures user authenticated

**Recommendations:**
- Enable PostgreSQL RLS policies as defense-in-depth (supplement, not replacement)
- Add integration test that verifies tenant data isolation
- Document tenantId requirement in each query function
- Consider schema-based separation for future scaling

---

### File Size Validation Only on Client

**Issue:** MAX_FILE_SIZE (10MB) is checked in browser and server, but server trusts client header.

**Files:** `app/(main)/(dashboard)/documents/actions.ts` (lines 61, 158)

**Code:**
```typescript
if (file.size > MAX_FILE_SIZE) // Checks JavaScript File.size property
```

**Risk:** Low (browser cannot spoof FormData.File size), but principle violation.

**Recommendations:**
- Check actual uploaded bytes server-side: `request.body.size` or stream length
- Add rate limiting on file uploads per tenant to prevent DoS
- Log upload size violations for abuse detection

---

## Performance Bottlenecks

### Large Action File Sizes

**Issue:** Server action files exceed 800+ lines, making them difficult to navigate and test.

**Files:**
- `app/(main)/(dashboard)/documents/actions.ts` (905 lines)
- `app/(main)/(dashboard)/analyses/actions.ts` (735 lines)
- `app/(main)/(dashboard)/generate/actions.ts` (876 lines)

**Impact:**
- Hard to find specific actions in large files
- Test files are similarly large (900+ lines)
- Increased cognitive load for maintainers
- Server action bundles larger

**Fix approach:**
- Split into logical modules by feature:
  - `documents/actions/upload.ts`
  - `documents/actions/query.ts`
  - `documents/actions/delete.ts`
- Use barrel export in `documents/actions/index.ts` to maintain API
- Same for analyses and generate modules

---

### Vector Embeddings API Rate Limit at 300 RPM

**Issue:** Voyage AI rate limit (300 RPM) is enforced via sleep in Inngest, but no queue or backoff strategy.

**Files:** `inngest/utils/concurrency.ts`, `inngest/functions/bootstrap/ingest-source.ts`

**Behavior:**
- Each embedding call sleeps 200ms after (1000ms / 5 RPM practical limit)
- No exponential backoff on 429 errors
- Bootstrap ingestion could take hours for large datasets

**Impact:** Low (MVP acceptable), but blocks scaling.

**Improvement path:**
1. Implement token bucket rate limiter in `lib/rate-limiter.ts`
2. Queue embeddings batch requests with configurable batch size (128 max)
3. Add exponential backoff: 1s → 2s → 4s on 429 response
4. Monitor Voyage API usage and alert before hitting limits

---

### Chat LRU Cache at 5-Min TTL

**Issue:** Vector search cache TTL of 5 minutes may cause stale results if reference data updates.

**Files:** `agents/tools/vector-search.ts`

**Config:**
- 5-minute TTL (300s)
- 500 entry limit
- 0.5 cosine distance threshold

**Impact:** Low (reference data rarely changes), but edge cases possible.

**Recommendations:**
- Track "last reference data update" timestamp
- Invalidate cache on bootstrap completion
- Add cache hit/miss metrics to Sentry

---

### Token Budget Tracking Not Integrated

**Issue:** BudgetTracker class exists but is not wired into agent pipeline.

**Files:** `lib/ai/budget.ts` (entire file is unused)

**Behavior:**
- Class calculates per-agent token usage and remaining budget
- Nowhere in agents pipeline calls `.record()` method
- No budget exceeded checks in step execution
- Agents can exceed 212K token budget without warning

**Impact:** Medium (expensive surprise billing possible)

**Fix approach:**
1. Wire BudgetTracker into `inngest/functions/analyze-nda.ts`
2. Pass tracker instance to each agent
3. After each agent step, record token usage from response metadata
4. Check `tracker.isWarning` (80% threshold) and emit alert event
5. Check `tracker.isExceeded` and halt pipeline with graceful failure

---

## Fragile Areas

### Analysis Agent Pipeline Interdependencies

**Files:**
- `agents/parser.ts`
- `agents/classifier.ts`
- `agents/risk-scorer.ts`
- `agents/gap-analyst.ts`

**Why fragile:**
- Parser output format (clause objects) tightly coupled to classifier input
- Classifier assigns risk levels that gap analyst depends on
- If parser changes category naming (e.g., "IP Ownership Assignment" → "IP_OWNERSHIP"), cascade failures
- No shared types between agents (each has own `Clause`, `AnalysisResult` types)

**Safe modification:**
- Create shared `agents/types.ts` with canonical `ClauseExtraction`, `ClassificationResult` types
- Add validation between agents using Zod schemas
- Add unit tests for each agent independently (fixtures in `agents/testing/`)

**Test coverage:**
- Agent-to-agent integration tests missing
- Gap analyst tests assume specific classifier output format
- No end-to-end pipeline tests

---

### Word Add-in Auth Code Exchange Race Condition

**Files:** `lib/auth-code-cache.ts` (lines 70-86)

**Code:**
```typescript
const cached = await redis.getdel<string>(key)  // Atomic get+delete
```

**Why fragile:**
- Relies on Redis `GETDEL` atomicity
- If Redis connection fails mid-getdel, code could be lost or duplicated
- No retry logic
- Taskpane would hang waiting for session

**Safe modification:**
- Add timeout on /exchange endpoint (5s max)
- Emit error event to taskpane on timeout
- Store attempt counter in Redis to detect repeated failures
- Test with simulated Redis failures

---

### Soft Delete Pattern in Queries

**Files:** `app/(main)/(dashboard)/documents/actions.ts` (line 183)

**Pattern:**
```typescript
isNull(documents.deletedAt)  // Soft delete filter in every query
```

**Why fragile:**
- Easy to forget soft-delete filter when adding new queries
- No database constraint prevents returning deleted records
- Hard to audit which queries check deletedAt
- Cascade behavior unclear (delete document → delete analyses? chunks?)

**Safe modification:**
- Add database-level view that excludes deleted records
- Use view in all queries instead of manual `isNull()` checks
- Document cascade behavior (should analyses soft-delete too?)
- Add pre-commit hook to check all document queries include deletion filter

---

### Email Sending in Critical User Flows

**Files:** `lib/email.ts` (455 lines - unused in password reset)

**Why fragile:**
- Email sends happen synchronously after DB inserts
- If email fails, user is created but no way to retry email
- No dead letter queue
- User cannot complete password reset if email fails

**Safe modification:**
- Enqueue email sends as Inngest events instead
- Add retry logic with exponential backoff
- Store email send status in database for audit
- Allow manual resend from UI

---

## Scaling Limits

### Single Neon Database for All Tenants

**Current capacity:**
- ~10K documents per tenant (estimate before slowdown)
- ~50K analyses total (vector search O(n) without index optimization)
- Embeddings table ~33K reference documents (CUAD + ContractNLI)

**Limit:** Single database hits PostgreSQL connection limits (~100 concurrent) at ~500 active users.

**Scaling path:**
1. Add connection pooling with PgBouncer (already in place via Neon Serverless)
2. Split read replicas for reference data queries (CUAD, ContractNLI)
3. Shard by tenant after 10K+ tenants (each tenant database)
4. Archive old analyses to cold storage (S3) after 1 year

---

### Voyage AI Rate Limit at 300 RPM

**Current usage:** Bootstrap can require 10K+ API calls (33K reference docs / 128 batch limit).

**Scaling path:**
1. Request higher rate limit from Voyage AI (500+ RPM for production)
2. Implement queue-based batching to hit rate limits efficiently
3. Cache embeddings aggressively (current: 1-hour TTL, 10K entries)
4. Consider self-hosted embedding model for future (e.g., Ollama)

---

### Claude API Token Rate Limit at 60 RPM

**Current impact:** Analysis pipeline sleeps after each agent to respect limit.

**Scaling path:**
1. Request Claude Batch API access (lower cost, async processing)
2. Implement work queue to buffer analysis requests
3. Add priority queue for high-value tenants
4. Cache common analysis results (same NDA template analyzed multiple times)

---

### Inngest Concurrency Limits

**Config:** 5 concurrent analyses per tenant, 3 comparisons, 5 generations.

**Risk:** Tenant can queue unlimited documents, but only 5 process concurrently. Queue grows unbounded.

**Scaling path:**
- Add per-tenant queue depth limit (e.g., max 50 pending)
- Implement fair scheduling across tenants
- Add SLA monitoring (analysis should complete within 10 minutes)

---

## Dependencies at Risk

### Parquet Parsing Library: @dsnp/parquetjs

**Risk:** Unmaintained library with minimal community support.

**Impact:**
- If Parquet format changes (unlikely) or binary incompatibility emerges, no upstream fixes
- Type casting to `unknown` forces runtime assertions
- Errors during parsing could silently corrupt bootstrap data

**Migration plan:**
- Monitor for alternatives: `parquetjs` (more mature), `apache-arrow` (Rust-based)
- Consider pre-converting Parquet to JSON for simpler parsing
- Add validation layer after parsing to catch corruption early

---

### Vercel Blob Storage Rate Limits

**Risk:** Vercel Blob has undocumented rate limits; docs promise "unlimited" throughput.

**Impact:**
- 1000+ concurrent uploads could hit undocumented limits
- No fallback storage if Vercel Blob becomes unavailable
- Downloading analysis results could fail if Blob is down

**Recommendations:**
- Add `documentUrl` retry logic with exponential backoff
- Monitor Blob API errors and alert on 429 responses
- Document storage fallback: local filesystem or S3

---

## Missing Critical Features

### PDF Export Feature

**Problem:** Users cannot download analysis reports as PDFs (returns fake URL).

**Blocks:** Production launch (users expect export capability).

**Implementation approach:**
- Use `pdf-lib` to generate PDF programmatically
- Add template with company logo, analysis summary, clause breakdown
- Upload to Vercel Blob and return signed URL

---

### Email Sending for Critical Events

**Problem:** Password reset emails not sent, preventing non-OAuth user recovery.

**Blocks:** Production launch for email/password authentication.

**Implementation approach:**
- Integrate with Resend or SMTP provider
- Add email queue with retry logic
- Template emails: password reset, invitation, analysis complete

---

### Analysis Cancellation

**Problem:** Running analysis cannot be stopped; wastes tokens if user wants to cancel.

**Blocks:** Production launch (poor UX when mistakes happen).

**Implementation approach:**
- Implement Inngest run cancellation API
- Update analysis status to "cancelled"
- Clean up partially-written results

---

### Real-time Progress Streaming

**Problem:** Analysis progress updates only available via polling (not streaming).

**Blocks:** Premium feature (analysis can take 5+ minutes).

**Implementation approach:**
- Emit progress events from Inngest steps
- Use SSE or WebSocket to stream updates to client
- Show step-by-step progress (parsing → classifying → risk scoring → gap analysis)

---

## Test Coverage Gaps

### Agent-to-Agent Integration Tests

**What's not tested:** Serialization/deserialization between agents; format compatibility.

**Files:** `agents/**.test.ts`

**Risk:** High (parser changes break classifier silently)

**Coverage:** ~60% (individual agents tested, not pipeline)

**Priority:** High

**Approach:**
- Create `agents/pipeline.test.ts` with end-to-end fixtures
- Test entire pipeline with sample NDA text
- Verify clause objects pass through all 4 agents unchanged

---

### Multi-Tenant Data Isolation

**What's not tested:** Can tenant A see tenant B's documents?

**Files:** All `app/(dashboard)/**/*.test.ts`

**Risk:** Critical (GDPR violation if data leaks)

**Coverage:** 40% (some action tests check tenantId, but not integration)

**Priority:** Critical

**Approach:**
- Add integration test that creates 2 tenants
- Upload document to tenant A
- Verify tenant B cannot retrieve/modify tenant A's documents
- Test all query/mutation actions

---

### Vector Search Similarity Threshold Edge Cases

**What's not tested:** What happens at exactly 0.5 cosine distance (threshold)?

**Files:** `agents/tools/vector-search.test.ts`

**Risk:** Medium (incorrect results on boundary cases)

**Coverage:** 70% (basic functionality tested, edges not)

**Priority:** Medium

**Approach:**
- Test with embeddings at exactly 0.5 distance
- Test with 0.49 (should match) and 0.51 (should not match)
- Verify LRU cache eviction and TTL behavior

---

### Word Add-in Auth Code Exchange Edge Cases

**What's not tested:** Redis connection failures, code expiration, race conditions.

**Files:** `lib/auth-code-cache.ts` (no tests)

**Risk:** Medium (broken auth for Word Add-in users)

**Coverage:** 0%

**Priority:** Medium

**Approach:**
- Mock Redis with success/failure scenarios
- Test expired code (>60s) handling
- Test duplicate code exchange attempts
- Test GETDEL atomicity

---

### Rate Limiting and Budget Enforcement

**What's not tested:** Token budget exceeded, rate limit backoff.

**Files:** `lib/ai/budget.ts` (tested), but not integrated into agents

**Risk:** High (runaway costs possible)

**Coverage:** Budget class tested (80%), but integration 0%

**Priority:** High

**Approach:**
- Add agent test that mocks token responses > budget
- Verify pipeline halts gracefully
- Check budget warning event emitted at 80% threshold

---

*Concerns audit: 2026-02-04*
