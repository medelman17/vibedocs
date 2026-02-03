# API Index

Generated: 2026-02-03T20:40:08.591Z

This file is auto-generated. Do not edit manually.
Regenerate with: `pnpm generate:api-index`

## db/_columns.ts

- `timestamps` - Standard timestamp columns for tracking record creation and modification times
- `softDelete` - Soft delete column for marking records as deleted without physical removal
- `tenantId` - Tenant identifier column for multi-tenant data isolation
- `primaryId` - Primary key column using UUID v4 with automatic random generation

## db/queries/documents.ts

- `DocumentStatus` - Document processing status representing stages in the analysis pipeline
- `getDocumentsByTenant(tenantId: string, options: {
    status?: DocumentStatus
    limit?: number
    offset?: number
  })` - Retrieves a paginated list of documents for a specific tenant
- `getDocumentById(documentId: string, tenantId: string)` - Retrieves a single document by its ID with tenant isolation
- `getDocumentWithChunks(documentId: string, tenantId: string)` - Retrieves a document along with all its associated chunks
- `updateDocumentStatus(documentId: string, tenantId: string, status: DocumentStatus, errorMessage?: string)` - Updates a document's processing status and optional error message
- `softDeleteDocument(documentId: string, tenantId: string)` - Soft deletes a document by setting its deletedAt timestamp
- `createDocumentChunks(tenantId: string, documentId: string, chunks: Array<{
    content: string
    chunkIndex: number
    sectionPath?: string[]
    embedding?: number[]
    tokenCount?: number
    metadata?: Record<string, unknown>
  }>)` - Creates document chunks in a batch insert operation
- `updateChunkEmbedding(chunkId: string, tenantId: string, embedding: number[])` - Updates a chunk's vector embedding after asynchronous generation

## db/queries/analyses.ts

- `AnalysisStatus` - Analysis processing status indicating the current stage in the pipeline
- `RiskLevel` - Risk assessment level for individual clauses or overall document analysis
- `getAnalysisByDocument(documentId: string, tenantId: string)` - Retrieves the most recent analysis for a given document
- `getAnalysisById(analysisId: string, tenantId: string)` - Retrieves a specific analysis by its unique identifier
- `getAnalysisWithClauses(analysisId: string, tenantId: string)` - Retrieves an analysis along with all its extracted clauses
- `createAnalysis(tenantId: string, documentId: string, inngestRunId?: string)` - Creates a new analysis record for a document
- `updateAnalysisStatus(analysisId: string, tenantId: string, status: AnalysisStatus, results?: {
    overallRiskScore?: number
    overallRiskLevel?: RiskLevel
    summary?: string
    gapAnalysis?: Record<string, unknown>
    tokenUsage?: { input: number; output: number; cost_usd: number }
    processingTimeMs?: number
  })` - Updates the status and results of an analysis atomically
- `createClauseExtractions(tenantId: string, analysisId: string, documentId: string, clauses: Array<{
    chunkId?: string
    category: string
    secondaryCategories?: string[]
    clauseText: string
    startPosition?: number
    endPosition?: number
    confidence: number
    riskLevel: RiskLevel
    riskExplanation?: string
    evidence?: Record<string, unknown>
    metadata?: Record<string, unknown>
  }>)` - Batch inserts clause extractions for an analysis
- `getClausesByCategory(analysisId: string, tenantId: string, category: string)` - Retrieves clause extractions filtered by CUAD category
- `getHighRiskClauses(analysisId: string, tenantId: string, _minConfidence: number)` - Retrieves all high-risk (aggressive) clauses from an analysis

## db/queries/similarity.ts

- `Granularity` - Granularity levels for embeddings in the reference corpus
- `findSimilarChunks(embedding: number[], tenantId: string, options: {
    limit?: number
    threshold?: number
    documentId?: string
  })` - Find semantically similar chunks within tenant documents for RAG retrieval
- `findSimilarReferences(embedding: number[], options: {
    granularity?: Granularity
    category?: string
    limit?: number
    threshold?: number
  })` - Find semantically similar embeddings in the shared reference corpus
- `findMatchingCategories(embedding: number[], options: {
    limit?: number
    threshold?: number
  })` - Find the best matching CUAD categories for a clause embedding
- `findSimilarTemplates(embedding: number[], options: {
    limit?: number
    threshold?: number
  })` - Find similar template sections for NDA generation

## lib/errors.ts

- `ErrorCode` - Custom error classes for structured error handling
- `ErrorDetail` - Interface ErrorDetail
- `SerializedError` - Interface SerializedError
- `AppError` - Base application error class
- `BadRequestError` - 400 Bad Request - Generic client error
- `ValidationError` - 400 Validation Error - Input validation failed
- `UnauthorizedError` - 401 Unauthorized - Authentication required or failed
- `ForbiddenError` - 403 Forbidden - Authenticated but not authorized
- `NotFoundError` - 404 Not Found - Resource doesn't exist
- `ConflictError` - 409 Conflict - Resource state conflict (duplicate, already exists, etc
- `RateLimitError` - 429 Rate Limited - Too many requests
- `InternalError` - 500 Internal Error - Unexpected server error
- `ServiceUnavailableError` - 503 Service Unavailable - Dependency unavailable
- `DuplicateError` - 409 Duplicate - Resource already exists (more specific than Conflict)
- `AnalysisFailedError` - 500 Analysis Failed - NDA analysis pipeline error
- `EmbeddingFailedError` - 500 Embedding Failed - Vector embedding generation error
- `LlmFailedError` - 500 LLM Failed - Language model API error
- `isAppError(error: unknown)` - Type guard to check if an error is an AppError
- `toAppError(error: unknown)` - Convert any error to an AppError for consistent handling

## lib/api-utils.ts

- `ApiResponse` - Standard API response shape for all endpoints
- `success(data: T, status: unknown)` - Create a success response
- `error(err: AppError)` - Create an error response from an AppError
- `RouteContext` - Route context for dynamic routes (Next
- `withErrorHandling(handler: (request: Request, context: RouteContext<P>) => Promise<NextResponse<ApiResponse<T>>>)` - Wrap an async handler with consistent error handling
- `ActionResult` - Result type for server actions (can't use NextResponse)
- `actionSuccess(data: T)` - Create a success result for server actions
- `actionError(err: unknown)` - Create an error result for server actions
- `withActionErrorHandling(action: (...args: TArgs) => Promise<ActionResult<TResult>>)` - Wrap a server action with consistent error handling

## lib/dal.ts

- `verifySession` - Constant verifySession
- `withTenant` - Constant withTenant
- `requireRole` - Constant requireRole

## inngest/utils/errors.ts

- `InngestWorkflowError` - Class InngestWorkflowError
- `RetriableError` - Temporary failure that should be retried
- `NonRetriableError` - Permanent failure that should NOT be retried
- `ValidationError` - Validation failure
- `NotFoundError` - Resource not found
- `ApiError` - External API failure
- `isRetriableError(error: unknown)` - Check if an error should trigger Inngest retry
- `wrapWithErrorHandling(operation: string, fn: () => Promise<T>)` - Wrap async function with error classification

## inngest/utils/rate-limit.ts

- `RATE_LIMITS` - Rate limit configurations for external APIs
- `getRateLimitDelay(service: keyof typeof RATE_LIMITS)` - Get delay string for step
- `getBatchSize(service: keyof typeof RATE_LIMITS)` - Get optimal batch size for a service
- `estimateProcessingTime(service: keyof typeof RATE_LIMITS, itemCount: number)` - Estimate processing time in seconds
- `RateLimitError` - Rate limit error with retry information
- `withRateLimit(service: keyof typeof RATE_LIMITS, fn: () => Promise<T>)` - Wrapper for rate-limited API calls

## inngest/utils/concurrency.ts

- `CONCURRENCY` - Constant CONCURRENCY
- `RETRY_CONFIG` - Retry configurations for different operation types
- `STEP_TIMEOUTS` - Step timeout configurations
- `ConcurrencyConfig` - Type for concurrency configuration values
- `RetryConfig` - Type for retry configuration values
- `StepTimeout` - Type for step timeout values
- `ConcurrencyKey` - Keys for concurrency configurations
- `RetryKey` - Keys for retry configurations
- `StepTimeoutKey` - Keys for step timeout configurations

## inngest/utils/tenant-context.ts

- `TenantContext` - Tenant context with database and tenant ID
- `setTenantContext(tenantId: string)` - Set RLS context for database session
- `withTenantContext(tenantId: string, fn: (ctx: TenantContext) => Promise<T>)` - Execute function with tenant context
- `verifyTenantOwnership(tableName: string, resourceId: string, tenantId: string)` - Verify resource belongs to tenant
