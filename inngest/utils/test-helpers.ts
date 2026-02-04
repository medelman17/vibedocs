// src/inngest/utils/test-helpers.ts
/**
 * @fileoverview Test Utilities for Inngest Functions
 *
 * Provides mock objects and assertion helpers for testing Inngest functions
 * without needing a real Inngest server or database connections.
 *
 * @module inngest/utils/test-helpers
 */

import type { InngestEvents } from "../types"
import type { TenantContext } from "./tenant-context"
import { db } from "@/db"

/**
 * Result from a step.run() call, tracked for assertions.
 */
export interface StepResult<T = unknown> {
  name: string
  result: T
  executedAt: Date
  /** Sequence number tracking execution order for concurrent calls */
  sequence: number
}

/**
 * Sleep call tracked for assertions.
 */
export interface SleepCall {
  duration: string | number
  calledAt: Date
}

/**
 * Event sent via step.sendEvent(), tracked for assertions.
 */
export interface SentEvent<K extends keyof InngestEvents = keyof InngestEvents> {
  name: K
  data: InngestEvents[K]["data"]
  sentAt: Date
}

/**
 * Event payload for sendEvent - matches the real Inngest API.
 * Can be a single event or an array of events.
 */
export type SendEventPayload<K extends keyof InngestEvents = keyof InngestEvents> =
  | { name: K; data: InngestEvents[K]["data"] }
  | Array<{ name: keyof InngestEvents; data: InngestEvents[keyof InngestEvents]["data"] }>

/**
 * Mock step object returned by createMockStep().
 */
export interface MockStep {
  /** Execute a named step function */
  run: <T>(name: string, fn: () => Promise<T> | T) => Promise<T>
  /** Record a sleep call (does not actually sleep) */
  sleep: (duration: string | number) => Promise<void>
  /**
   * Record a sent event.
   *
   * Matches the real Inngest API signature:
   * step.sendEvent(stepId, { name: "event-name", data: payload })
   *
   * @param stepId - Unique identifier for this step (for memoization)
   * @param payload - Event payload with name and data, or array of events
   */
  sendEvent: <K extends keyof InngestEvents>(
    stepId: string,
    payload: SendEventPayload<K>
  ) => Promise<void>
}

/**
 * Mock step controller with accessors for test assertions.
 */
export interface MockStepController {
  /** The mock step object to pass to functions */
  step: MockStep
  /** Get all step results */
  getStepResults: () => StepResult[]
  /** Get all sleep calls */
  getSleepCalls: () => SleepCall[]
  /** Get all sent events */
  getSentEvents: () => SentEvent[]
  /** Reset all tracked calls */
  reset: () => void
}

/**
 * Create a properly typed mock event for testing Inngest functions.
 *
 * @param name - Event name (e.g., "nda/uploaded")
 * @param data - Event payload matching the event type
 * @returns Typed event object with name, data, ts, and id fields
 *
 * @example
 * const event = createMockEvent("nda/uploaded", {
 *   tenantId: "550e8400-e29b-41d4-a716-446655440000",
 *   documentId: "123e4567-e89b-12d3-a456-426614174000",
 *   fileName: "nda.pdf",
 *   fileType: "application/pdf",
 *   fileUrl: "https://example.com/nda.pdf",
 * })
 */
export function createMockEvent<K extends keyof InngestEvents>(
  name: K,
  data: InngestEvents[K]["data"]
): {
  name: K
  data: InngestEvents[K]["data"]
  ts: number
  id: string
} {
  return {
    name,
    data,
    ts: Date.now(),
    id: crypto.randomUUID(),
  }
}

/**
 * Create a mock step object for testing Inngest functions.
 *
 * The mock step tracks all calls to run(), sleep(), and sendEvent()
 * for later assertion. The run() method executes the provided function
 * synchronously and returns the result.
 *
 * @returns Mock step controller with step object and accessor methods
 *
 * @example
 * const { step, getStepResults, getSleepCalls, getSentEvents } = createMockStep()
 *
 * // Use in test
 * await myInngestFunction({ event, step })
 *
 * // Assert steps executed
 * expectStepExecuted(getStepResults(), "load-document")
 * expectStepResult(getStepResults(), "parse-document", { text: "..." })
 *
 * // Assert sleeps
 * expect(getSleepCalls()).toHaveLength(1)
 *
 * // Assert events sent
 * expect(getSentEvents()[0].name).toBe("nda/analysis.progress")
 */
export function createMockStep(): MockStepController {
  const stepResults: StepResult[] = []
  const sleepCalls: SleepCall[] = []
  const sentEvents: SentEvent[] = []
  let sequenceCounter = 0

  const step: MockStep = {
    async run<T>(name: string, fn: () => Promise<T> | T): Promise<T> {
      const result = await fn()
      stepResults.push({
        name,
        result,
        executedAt: new Date(),
        sequence: sequenceCounter++,
      })
      return result
    },

    async sleep(duration: string | number): Promise<void> {
      sleepCalls.push({
        duration,
        calledAt: new Date(),
      })
    },

    async sendEvent<K extends keyof InngestEvents>(
      _stepId: string,
      payload: SendEventPayload<K>
    ): Promise<void> {
      // Handle both single event and array of events
      const events = Array.isArray(payload) ? payload : [payload]

      for (const event of events) {
        const sentEvent: SentEvent = {
          name: event.name as keyof InngestEvents,
          data: event.data,
          sentAt: new Date(),
        }
        sentEvents.push(sentEvent)
      }
    },
  }

  return {
    step,
    getStepResults: () => [...stepResults],
    getSleepCalls: () => [...sleepCalls],
    getSentEvents: () => [...sentEvents],
    reset: () => {
      stepResults.length = 0
      sleepCalls.length = 0
      sentEvents.length = 0
      sequenceCounter = 0
    },
  }
}

/**
 * Assert that a step with the given name was executed.
 *
 * @param stepResults - Results from getStepResults()
 * @param expectedName - Name of the step to check
 * @throws Error if step was not executed
 *
 * @example
 * const { step, getStepResults } = createMockStep()
 * await myFunction({ step })
 * expectStepExecuted(getStepResults(), "load-document")
 */
export function expectStepExecuted(
  stepResults: StepResult[],
  expectedName: string
): void {
  const found = stepResults.find((r) => r.name === expectedName)
  if (!found) {
    const executedSteps = stepResults.map((r) => r.name).join(", ")
    throw new Error(
      `Expected step "${expectedName}" to be executed. ` +
        `Executed steps: [${executedSteps || "none"}]`
    )
  }
}

/**
 * Assert that a step returned the expected result.
 *
 * @param stepResults - Results from getStepResults()
 * @param expectedName - Name of the step to check
 * @param expectedResult - Expected return value (deep equality check)
 * @throws Error if step was not executed or result doesn't match
 *
 * @example
 * const { step, getStepResults } = createMockStep()
 * await myFunction({ step })
 * expectStepResult(getStepResults(), "parse-document", { text: "Hello" })
 */
export function expectStepResult<T>(
  stepResults: StepResult[],
  expectedName: string,
  expectedResult: T
): void {
  const found = stepResults.find((r) => r.name === expectedName)
  if (!found) {
    const executedSteps = stepResults.map((r) => r.name).join(", ")
    throw new Error(
      `Expected step "${expectedName}" to be executed. ` +
        `Executed steps: [${executedSteps || "none"}]`
    )
  }

  const actualJson = JSON.stringify(found.result, null, 2)
  const expectedJson = JSON.stringify(expectedResult, null, 2)

  if (actualJson !== expectedJson) {
    throw new Error(
      `Step "${expectedName}" result mismatch.\n` +
        `Expected: ${expectedJson}\n` +
        `Actual: ${actualJson}`
    )
  }
}

/**
 * Create a mock tenant context for testing.
 *
 * Unlike the real setTenantContext(), this doesn't set RLS
 * and uses a mock or test database.
 *
 * **Important: Database Mocking**
 *
 * This function imports the real `db` from `@/db`. For tests that need
 * database isolation, callers should mock `@/db` in their test files:
 *
 * ```typescript
 * vi.mock("@/db", () => ({
 *   db: {
 *     execute: vi.fn().mockResolvedValue({ rows: [] }),
 *     query: {},
 *   },
 * }))
 * ```
 *
 * This ensures tests don't require a real database connection.
 *
 * @param tenantId - Optional tenant ID (generates UUID if not provided)
 * @returns Mock TenantContext with db and tenantId
 *
 * @example
 * const ctx = createMockTenantContext()
 * // ctx.tenantId is a generated UUID
 * // ctx.db is the database instance
 *
 * const ctx2 = createMockTenantContext("550e8400-e29b-41d4-a716-446655440000")
 * // ctx2.tenantId is the provided ID
 */
export function createMockTenantContext(tenantId?: string): TenantContext {
  return {
    db,
    tenantId: tenantId ?? crypto.randomUUID(),
  }
}

/**
 * Create test event data with sensible defaults.
 *
 * Generates valid UUIDs for all ID fields and provides
 * appropriate defaults for other required fields.
 */
export const testEventData = {
  /**
   * Create DocumentUploadedPayload with defaults
   */
  documentUploaded: (overrides: Partial<InngestEvents["nda/uploaded"]["data"]> = {}) => ({
    tenantId: crypto.randomUUID(),
    documentId: crypto.randomUUID(),
    fileName: "test-nda.pdf",
    fileType: "application/pdf" as const,
    fileUrl: "https://example.com/test-nda.pdf",
    ...overrides,
  }),

  /**
   * Create AnalysisRequestedPayload with defaults
   */
  analysisRequested: (
    overrides: Partial<InngestEvents["nda/analysis.requested"]["data"]> = {}
  ) => ({
    tenantId: crypto.randomUUID(),
    documentId: crypto.randomUUID(),
    source: "web" as const,
    ...overrides,
  }),

  /**
   * Create AnalysisProgressPayload with defaults
   */
  analysisProgress: (
    overrides: Partial<InngestEvents["nda/analysis.progress"]["data"]> = {}
  ) => ({
    documentId: crypto.randomUUID(),
    analysisId: crypto.randomUUID(),
    tenantId: crypto.randomUUID(),
    stage: "parsing" as const,
    progress: 0,
    message: "Processing...",
    ...overrides,
  }),

  /**
   * Create ComparisonRequestedPayload with defaults
   */
  comparisonRequested: (
    overrides: Partial<InngestEvents["nda/comparison.requested"]["data"]> = {}
  ) => ({
    tenantId: crypto.randomUUID(),
    comparisonId: crypto.randomUUID(),
    documentAId: crypto.randomUUID(),
    documentBId: crypto.randomUUID(),
    ...overrides,
  }),
}
