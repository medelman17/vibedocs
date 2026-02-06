import { describe, it, expect } from 'vitest'
import { validateFileSize, validatePageCount } from './validation'
import { BUDGET_LIMITS } from './limits'

describe('validateFileSize', () => {
  it('returns valid for small files', () => {
    const result = validateFileSize(1024) // 1KB
    expect(result.valid).toBe(true)
    expect(result.error).toBeUndefined()
  })

  it('returns valid for files exactly at limit', () => {
    const result = validateFileSize(BUDGET_LIMITS.MAX_FILE_SIZE)
    expect(result.valid).toBe(true)
    expect(result.error).toBeUndefined()
  })

  it('returns invalid for files over limit', () => {
    const result = validateFileSize(BUDGET_LIMITS.MAX_FILE_SIZE + 1)
    expect(result.valid).toBe(false)
    expect(result.error).toBeDefined()
    expect(result.error?.code).toBe('FILE_TOO_LARGE')
    expect(result.error?.limit).toBe(BUDGET_LIMITS.MAX_FILE_SIZE)
    expect(result.error?.actual).toBe(BUDGET_LIMITS.MAX_FILE_SIZE + 1)
  })

  it('includes human-readable message', () => {
    const result = validateFileSize(BUDGET_LIMITS.MAX_FILE_SIZE + 1)
    expect(result.error?.message).toContain('10MB')
    expect(result.error?.message).toContain('limit')
  })
})

describe('validatePageCount', () => {
  function pdfBufferWithCount(count: number): Buffer {
    return Buffer.from(`%PDF-1.4 fake\n/Count ${count}\n%%EOF`, 'utf-8')
  }

  it('returns valid for non-PDF mime type', async () => {
    const buf = pdfBufferWithCount(100)
    const result = await validatePageCount(buf, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
    expect(result.valid).toBe(true)
  })

  it('returns valid when PDF page count is at limit', async () => {
    const buf = pdfBufferWithCount(BUDGET_LIMITS.MAX_PAGES)
    const result = await validatePageCount(buf, 'application/pdf')
    expect(result.valid).toBe(true)
  })

  it('returns valid when PDF page count is under limit', async () => {
    const buf = pdfBufferWithCount(10)
    const result = await validatePageCount(buf, 'application/pdf')
    expect(result.valid).toBe(true)
  })

  it('returns invalid when PDF page count exceeds limit', async () => {
    const buf = pdfBufferWithCount(BUDGET_LIMITS.MAX_PAGES + 1)
    const result = await validatePageCount(buf, 'application/pdf')
    expect(result.valid).toBe(false)
    expect(result.error?.code).toBe('TOO_MANY_PAGES')
    expect(result.error?.actual).toBe(BUDGET_LIMITS.MAX_PAGES + 1)
  })

  it('returns valid when PDF has no /Count (unable to determine)', async () => {
    const buf = Buffer.from('%PDF-1.4 minimal\n%%EOF', 'utf-8')
    const result = await validatePageCount(buf, 'application/pdf')
    expect(result.valid).toBe(true)
  })
})
