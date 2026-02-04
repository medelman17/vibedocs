import { describe, it, expect } from 'vitest'
import { validateFileSize } from './validation'
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

// Note: validatePageCount requires pdf-parse and real PDF buffers,
// which makes it complex to test in isolation. Integration tests
// in the upload flow will cover this functionality.
