// src/inngest/utils/test-helpers.test.ts
import { describe, it, expect, vi } from "vitest"
import {
  createMockEvent,
  createMockStep,
  createMockTenantContext,
  expectStepExecuted,
  expectStepResult,
  testEventData,
} from "./test-helpers"

// Mock the database
vi.mock("@/db", () => ({
  db: {
    execute: vi.fn().mockResolvedValue({ rows: [] }),
    query: {},
  },
}))

describe("test-helpers", () => {
  describe("createMockEvent", () => {
    it("should create event with correct name and data", () => {
      const event = createMockEvent("nda/uploaded", {
        tenantId: "550e8400-e29b-41d4-a716-446655440000",
        documentId: "123e4567-e89b-12d3-a456-426614174000",
        fileName: "test.pdf",
        fileType: "application/pdf",
        fileUrl: "https://example.com/test.pdf",
      })

      expect(event.name).toBe("nda/uploaded")
      expect(event.data.tenantId).toBe("550e8400-e29b-41d4-a716-446655440000")
      expect(event.data.documentId).toBe("123e4567-e89b-12d3-a456-426614174000")
      expect(event.data.fileName).toBe("test.pdf")
    })

    it("should generate timestamp", () => {
      const before = Date.now()
      const event = createMockEvent("nda/analysis.progress", {
        analysisId: "123e4567-e89b-12d3-a456-426614174000",
        step: "parsing",
        percent: 50,
      })
      const after = Date.now()

      expect(event.ts).toBeGreaterThanOrEqual(before)
      expect(event.ts).toBeLessThanOrEqual(after)
    })

    it("should generate unique event ID", () => {
      const event1 = createMockEvent("nda/analysis.progress", {
        analysisId: "123e4567-e89b-12d3-a456-426614174000",
        step: "parsing",
        percent: 0,
      })
      const event2 = createMockEvent("nda/analysis.progress", {
        analysisId: "123e4567-e89b-12d3-a456-426614174000",
        step: "parsing",
        percent: 0,
      })

      expect(event1.id).not.toBe(event2.id)
      // Verify UUIDs are valid format
      expect(event1.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
    })

    it("should work with all event types", () => {
      const uploaded = createMockEvent("nda/uploaded", {
        tenantId: crypto.randomUUID(),
        documentId: crypto.randomUUID(),
        fileName: "doc.pdf",
        fileType: "application/pdf",
        fileUrl: "https://example.com/doc.pdf",
      })
      expect(uploaded.name).toBe("nda/uploaded")

      const analysisRequested = createMockEvent("nda/analysis.requested", {
        tenantId: crypto.randomUUID(),
        documentId: crypto.randomUUID(),
        analysisId: crypto.randomUUID(),
      })
      expect(analysisRequested.name).toBe("nda/analysis.requested")

      const progress = createMockEvent("nda/analysis.progress", {
        analysisId: crypto.randomUUID(),
        step: "classification",
        percent: 75,
      })
      expect(progress.name).toBe("nda/analysis.progress")

      const comparison = createMockEvent("nda/comparison.requested", {
        tenantId: crypto.randomUUID(),
        comparisonId: crypto.randomUUID(),
        documentAId: crypto.randomUUID(),
        documentBId: crypto.randomUUID(),
      })
      expect(comparison.name).toBe("nda/comparison.requested")
    })
  })

  describe("createMockStep", () => {
    it("should execute step.run and track result", async () => {
      const { step, getStepResults } = createMockStep()

      const result = await step.run("test-step", async () => {
        return { value: 42 }
      })

      expect(result).toEqual({ value: 42 })
      expect(getStepResults()).toHaveLength(1)
      expect(getStepResults()[0].name).toBe("test-step")
      expect(getStepResults()[0].result).toEqual({ value: 42 })
    })

    it("should track multiple step executions", async () => {
      const { step, getStepResults } = createMockStep()

      await step.run("step-1", () => "first")
      await step.run("step-2", () => "second")
      await step.run("step-3", () => "third")

      expect(getStepResults()).toHaveLength(3)
      expect(getStepResults().map((r) => r.name)).toEqual(["step-1", "step-2", "step-3"])
    })

    it("should track sequence numbers for execution order", async () => {
      const { step, getStepResults } = createMockStep()

      await step.run("step-a", () => "a")
      await step.run("step-b", () => "b")
      await step.run("step-c", () => "c")

      const results = getStepResults()
      expect(results[0].sequence).toBe(0)
      expect(results[1].sequence).toBe(1)
      expect(results[2].sequence).toBe(2)
    })

    it("should reset sequence counter on reset()", async () => {
      const { step, getStepResults, reset } = createMockStep()

      await step.run("step-1", () => "first")
      await step.run("step-2", () => "second")
      expect(getStepResults()[1].sequence).toBe(1)

      reset()

      await step.run("step-a", () => "a")
      expect(getStepResults()[0].sequence).toBe(0)
    })

    it("should track sleep calls without actually sleeping", async () => {
      const { step, getSleepCalls } = createMockStep()

      const start = Date.now()
      await step.sleep("1h")
      await step.sleep(5000)
      const elapsed = Date.now() - start

      expect(getSleepCalls()).toHaveLength(2)
      expect(getSleepCalls()[0].duration).toBe("1h")
      expect(getSleepCalls()[1].duration).toBe(5000)
      // Should not have actually slept
      expect(elapsed).toBeLessThan(100)
    })

    it("should track sent events", async () => {
      const { step, getSentEvents } = createMockStep()

      await step.sendEvent("emit-progress-1", {
        name: "nda/analysis.progress",
        data: {
          analysisId: "123e4567-e89b-12d3-a456-426614174000",
          step: "parsing",
          percent: 25,
        },
      })

      await step.sendEvent("emit-progress-2", {
        name: "nda/analysis.progress",
        data: {
          analysisId: "123e4567-e89b-12d3-a456-426614174000",
          step: "classification",
          percent: 50,
        },
      })

      expect(getSentEvents()).toHaveLength(2)
      expect(getSentEvents()[0].name).toBe("nda/analysis.progress")
      expect(getSentEvents()[0].data.percent).toBe(25)
      expect(getSentEvents()[1].data.percent).toBe(50)
    })

    it("should handle array of events", async () => {
      const { step, getSentEvents } = createMockStep()

      await step.sendEvent("emit-batch", [
        {
          name: "nda/analysis.progress",
          data: {
            analysisId: "123e4567-e89b-12d3-a456-426614174000",
            step: "parsing",
            percent: 10,
          },
        },
        {
          name: "nda/analysis.progress",
          data: {
            analysisId: "123e4567-e89b-12d3-a456-426614174000",
            step: "classification",
            percent: 20,
          },
        },
      ])

      expect(getSentEvents()).toHaveLength(2)
      expect(getSentEvents()[0].data.percent).toBe(10)
      expect(getSentEvents()[1].data.percent).toBe(20)
    })

    it("should reset all tracked calls", async () => {
      const { step, getStepResults, getSleepCalls, getSentEvents, reset } = createMockStep()

      await step.run("test", () => "result")
      await step.sleep("1m")
      await step.sendEvent("emit-progress", {
        name: "nda/analysis.progress",
        data: { analysisId: crypto.randomUUID(), step: "test", percent: 0 },
      })

      expect(getStepResults()).toHaveLength(1)
      expect(getSleepCalls()).toHaveLength(1)
      expect(getSentEvents()).toHaveLength(1)

      reset()

      expect(getStepResults()).toHaveLength(0)
      expect(getSleepCalls()).toHaveLength(0)
      expect(getSentEvents()).toHaveLength(0)
    })

    it("should return copies of tracked arrays", () => {
      const { getStepResults, getSleepCalls, getSentEvents } = createMockStep()

      const results1 = getStepResults()
      const results2 = getStepResults()

      // Should be different array instances
      expect(results1).not.toBe(results2)
      expect(getSleepCalls()).not.toBe(getSleepCalls())
      expect(getSentEvents()).not.toBe(getSentEvents())
    })
  })

  describe("expectStepExecuted", () => {
    it("should not throw if step was executed", async () => {
      const { step, getStepResults } = createMockStep()
      await step.run("my-step", () => "done")

      expect(() => expectStepExecuted(getStepResults(), "my-step")).not.toThrow()
    })

    it("should throw if step was not executed", () => {
      const { getStepResults } = createMockStep()

      expect(() => expectStepExecuted(getStepResults(), "missing-step")).toThrow(
        'Expected step "missing-step" to be executed'
      )
    })

    it("should list executed steps in error message", async () => {
      const { step, getStepResults } = createMockStep()
      await step.run("step-a", () => null)
      await step.run("step-b", () => null)

      expect(() => expectStepExecuted(getStepResults(), "missing")).toThrow(
        "Executed steps: [step-a, step-b]"
      )
    })

    it("should show 'none' when no steps executed", () => {
      const { getStepResults } = createMockStep()

      expect(() => expectStepExecuted(getStepResults(), "missing")).toThrow(
        "Executed steps: [none]"
      )
    })
  })

  describe("expectStepResult", () => {
    it("should not throw if result matches", async () => {
      const { step, getStepResults } = createMockStep()
      await step.run("compute", () => ({ value: 42, items: [1, 2, 3] }))

      expect(() =>
        expectStepResult(getStepResults(), "compute", { value: 42, items: [1, 2, 3] })
      ).not.toThrow()
    })

    it("should throw if step was not executed", () => {
      const { getStepResults } = createMockStep()

      expect(() => expectStepResult(getStepResults(), "missing", {})).toThrow(
        'Expected step "missing" to be executed'
      )
    })

    it("should throw if result does not match", async () => {
      const { step, getStepResults } = createMockStep()
      await step.run("compute", () => ({ value: 42 }))

      expect(() => expectStepResult(getStepResults(), "compute", { value: 100 })).toThrow(
        'Step "compute" result mismatch'
      )
    })

    it("should include expected and actual in error", async () => {
      const { step, getStepResults } = createMockStep()
      await step.run("test", () => ({ actual: "value" }))

      try {
        expectStepResult(getStepResults(), "test", { expected: "different" })
        expect.fail("Should have thrown")
      } catch (e) {
        const error = e as Error
        expect(error.message).toContain("Expected:")
        expect(error.message).toContain("Actual:")
        expect(error.message).toContain('"expected": "different"')
        expect(error.message).toContain('"actual": "value"')
      }
    })
  })

  describe("createMockTenantContext", () => {
    it("should generate UUID if tenantId not provided", () => {
      const ctx = createMockTenantContext()

      expect(ctx.tenantId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      )
      expect(ctx.db).toBeDefined()
    })

    it("should use provided tenantId", () => {
      const tenantId = "550e8400-e29b-41d4-a716-446655440000"
      const ctx = createMockTenantContext(tenantId)

      expect(ctx.tenantId).toBe(tenantId)
    })

    it("should generate different UUIDs each time", () => {
      const ctx1 = createMockTenantContext()
      const ctx2 = createMockTenantContext()

      expect(ctx1.tenantId).not.toBe(ctx2.tenantId)
    })
  })

  describe("testEventData", () => {
    describe("documentUploaded", () => {
      it("should generate valid payload with defaults", () => {
        const data = testEventData.documentUploaded()

        expect(data.tenantId).toMatch(/^[0-9a-f-]{36}$/i)
        expect(data.documentId).toMatch(/^[0-9a-f-]{36}$/i)
        expect(data.fileName).toBe("test-nda.pdf")
        expect(data.fileType).toBe("application/pdf")
        expect(data.fileUrl).toBe("https://example.com/test-nda.pdf")
      })

      it("should allow overrides", () => {
        const data = testEventData.documentUploaded({
          fileName: "custom.docx",
          fileType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        })

        expect(data.fileName).toBe("custom.docx")
        expect(data.fileType).toBe(
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        )
      })
    })

    describe("analysisRequested", () => {
      it("should generate valid payload with defaults", () => {
        const data = testEventData.analysisRequested()

        expect(data.tenantId).toMatch(/^[0-9a-f-]{36}$/i)
        expect(data.documentId).toMatch(/^[0-9a-f-]{36}$/i)
        expect(data.analysisId).toMatch(/^[0-9a-f-]{36}$/i)
      })

      it("should allow overrides including optional version", () => {
        const data = testEventData.analysisRequested({
          version: 2,
        })

        expect(data.version).toBe(2)
      })
    })

    describe("analysisProgress", () => {
      it("should generate valid payload with defaults", () => {
        const data = testEventData.analysisProgress()

        expect(data.analysisId).toMatch(/^[0-9a-f-]{36}$/i)
        expect(data.step).toBe("parsing")
        expect(data.percent).toBe(0)
      })

      it("should allow overrides", () => {
        const data = testEventData.analysisProgress({
          step: "risk-scoring",
          percent: 75,
          message: "Scoring clause 3 of 5",
        })

        expect(data.step).toBe("risk-scoring")
        expect(data.percent).toBe(75)
        expect(data.message).toBe("Scoring clause 3 of 5")
      })
    })

    describe("comparisonRequested", () => {
      it("should generate valid payload with defaults", () => {
        const data = testEventData.comparisonRequested()

        expect(data.tenantId).toMatch(/^[0-9a-f-]{36}$/i)
        expect(data.comparisonId).toMatch(/^[0-9a-f-]{36}$/i)
        expect(data.documentAId).toMatch(/^[0-9a-f-]{36}$/i)
        expect(data.documentBId).toMatch(/^[0-9a-f-]{36}$/i)
      })

      it("should generate different IDs for documentA and documentB", () => {
        const data = testEventData.comparisonRequested()

        expect(data.documentAId).not.toBe(data.documentBId)
      })
    })
  })
})
