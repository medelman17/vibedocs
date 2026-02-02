// src/inngest/client.test.ts
/**
 * @fileoverview Tests for Inngest Client Configuration
 *
 * Tests client configuration, event schema validation, test helper functionality,
 * and barrel export completeness.
 */

import { describe, it, expect, vi } from "vitest"
import { inngest, type InngestClient } from "./client"
import { createMockEvent, testEventData } from "./utils/test-helpers"
import type { InngestEvents } from "./types"

// Mock the database for test helpers
vi.mock("@/db", () => ({
  db: {
    execute: vi.fn().mockResolvedValue({ rows: [] }),
    query: {},
  },
}))

describe("Inngest Client", () => {
  describe("client configuration", () => {
    it("should have correct client ID", () => {
      expect(inngest.id).toBe("nda-analyst")
    })

    it("should export InngestClient type", () => {
      // Type assertion - if this compiles, the type is exported correctly
      const client: InngestClient = inngest
      expect(client).toBeDefined()
    })

    it("should have event schemas configured", () => {
      // The client is configured with EventSchemas - verify it exists
      // We can't directly inspect the schemas, but we can verify the client
      // was created with the correct configuration by checking it's functional
      expect(inngest).toBeDefined()
      expect(typeof inngest.createFunction).toBe("function")
      expect(typeof inngest.send).toBe("function")
    })
  })

  describe("event type safety", () => {
    describe("nda/uploaded event", () => {
      it("should create typed event with createMockEvent", () => {
        const data = testEventData.documentUploaded()
        const event = createMockEvent("nda/uploaded", data)

        expect(event.name).toBe("nda/uploaded")
        expect(event.data).toEqual(data)
        expect(event.ts).toBeTypeOf("number")
        expect(event.id).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
        )
      })

      it("should enforce required fields via TypeScript", () => {
        // This test verifies type safety at compile time
        // The following would cause TypeScript errors if uncommented:
        // createMockEvent("nda/uploaded", {}) // Missing required fields
        // createMockEvent("nda/uploaded", { tenantId: "test" }) // Missing other fields

        const validEvent = createMockEvent("nda/uploaded", {
          tenantId: crypto.randomUUID(),
          documentId: crypto.randomUUID(),
          fileName: "test.pdf",
          fileType: "application/pdf",
          fileUrl: "https://example.com/test.pdf",
        })
        expect(validEvent.data.fileName).toBe("test.pdf")
      })
    })

    describe("nda/analysis.requested event", () => {
      it("should create typed event with createMockEvent", () => {
        const data = testEventData.analysisRequested()
        const event = createMockEvent("nda/analysis.requested", data)

        expect(event.name).toBe("nda/analysis.requested")
        expect(event.data.tenantId).toBe(data.tenantId)
        expect(event.data.documentId).toBe(data.documentId)
        expect(event.data.analysisId).toBe(data.analysisId)
      })

      it("should allow optional version field", () => {
        const data = testEventData.analysisRequested({ version: 2 })
        const event = createMockEvent("nda/analysis.requested", data)

        expect(event.data.version).toBe(2)
      })
    })

    describe("nda/analysis.progress event", () => {
      it("should create typed event with createMockEvent", () => {
        const data = testEventData.analysisProgress({
          step: "classification",
          percent: 50,
        })
        const event = createMockEvent("nda/analysis.progress", data)

        expect(event.name).toBe("nda/analysis.progress")
        expect(event.data.step).toBe("classification")
        expect(event.data.percent).toBe(50)
      })

      it("should allow optional message field", () => {
        const data = testEventData.analysisProgress({
          message: "Processing clause 5 of 10",
        })
        const event = createMockEvent("nda/analysis.progress", data)

        expect(event.data.message).toBe("Processing clause 5 of 10")
      })
    })

    describe("nda/comparison.requested event", () => {
      it("should create typed event with createMockEvent", () => {
        const data = testEventData.comparisonRequested()
        const event = createMockEvent("nda/comparison.requested", data)

        expect(event.name).toBe("nda/comparison.requested")
        expect(event.data.comparisonId).toBe(data.comparisonId)
        expect(event.data.documentAId).toBe(data.documentAId)
        expect(event.data.documentBId).toBe(data.documentBId)
      })
    })

    it("should reject invalid event names at compile time", () => {
      // This test documents that TypeScript prevents invalid event names
      // The following would cause a TypeScript error if uncommented:
      // createMockEvent("invalid/event", {})
      // createMockEvent("nda/nonexistent", {})

      // Valid event names compile successfully
      const validNames: (keyof InngestEvents)[] = [
        "nda/uploaded",
        "nda/analysis.requested",
        "nda/analysis.progress",
        "nda/comparison.requested",
      ]
      expect(validNames).toHaveLength(4)
    })
  })

  describe("barrel export", () => {
    it("should export inngest client from @/inngest", async () => {
      const barrel = await import("./index")
      expect(barrel.inngest).toBe(inngest)
    })

    it("should export InngestClient type from @/inngest", async () => {
      // Type-level test - verifies the type is exported
      const barrel = await import("./index")
      const client: typeof barrel.inngest = barrel.inngest
      expect(client.id).toBe("nda-analyst")
    })

    it("should export all event type definitions", async () => {
      const barrel = await import("./index")

      // Verify Zod schemas are exported
      expect(barrel.baseTenantPayload).toBeDefined()
      expect(barrel.documentUploadedPayload).toBeDefined()
      expect(barrel.analysisRequestedPayload).toBeDefined()
      expect(barrel.analysisProgressPayload).toBeDefined()
      expect(barrel.comparisonRequestedPayload).toBeDefined()
      expect(barrel.eventSchemas).toBeDefined()
    })

    it("should export rate limiting utilities", async () => {
      const barrel = await import("./index")

      expect(barrel.RATE_LIMITS).toBeDefined()
      expect(barrel.getRateLimitDelay).toBeDefined()
      expect(barrel.getBatchSize).toBeDefined()
      expect(barrel.estimateProcessingTime).toBeDefined()
      expect(barrel.withRateLimit).toBeDefined()
      expect(barrel.RateLimitError).toBeDefined()
    })

    it("should export concurrency and retry configuration", async () => {
      const barrel = await import("./index")

      expect(barrel.CONCURRENCY).toBeDefined()
      expect(barrel.RETRY_CONFIG).toBeDefined()
      expect(barrel.STEP_TIMEOUTS).toBeDefined()
    })

    it("should export tenant context utilities", async () => {
      const barrel = await import("./index")

      expect(barrel.setTenantContext).toBeDefined()
      expect(barrel.withTenantContext).toBeDefined()
      expect(barrel.verifyTenantOwnership).toBeDefined()
    })

    it("should export error handling utilities", async () => {
      const barrel = await import("./index")

      expect(barrel.InngestWorkflowError).toBeDefined()
      expect(barrel.RetriableError).toBeDefined()
      expect(barrel.NonRetriableError).toBeDefined()
      expect(barrel.ValidationError).toBeDefined()
      expect(barrel.NotFoundError).toBeDefined()
      expect(barrel.ApiError).toBeDefined()
      expect(barrel.isRetriableError).toBeDefined()
      expect(barrel.wrapWithErrorHandling).toBeDefined()
    })

    it("should export functions registry", async () => {
      const barrel = await import("./index")

      expect(barrel.functions).toBeDefined()
      expect(Array.isArray(barrel.functions)).toBe(true)
    })

    it("should NOT export test helpers from barrel", async () => {
      const barrel = await import("./index")

      // Test helpers should be imported directly from utils/test-helpers
      // They should not be part of the production barrel export
      expect((barrel as Record<string, unknown>).createMockEvent).toBeUndefined()
      expect((barrel as Record<string, unknown>).createMockStep).toBeUndefined()
      expect((barrel as Record<string, unknown>).testEventData).toBeUndefined()
    })
  })
})
