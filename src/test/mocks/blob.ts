// src/test/mocks/blob.ts
/**
 * Mock utilities for Vercel Blob storage.
 */

import { vi } from "vitest"

// ============================================================================
// Mock State
// ============================================================================

let uploadedFiles: Map<string, { url: string; pathname: string }> = new Map()
let uploadCounter = 0

// ============================================================================
// Mock Implementations
// ============================================================================

export const mockUploadFile = vi.fn(
  async (file: File, _options?: { folder?: string }) => {
    uploadCounter++
    const url = `https://blob.test/uploads/${uploadCounter}-${file.name}`
    uploadedFiles.set(url, { url, pathname: file.name })
    return { url, pathname: file.name }
  }
)

export const mockDeleteFile = vi.fn(async (url: string) => {
  uploadedFiles.delete(url)
  return undefined
})

export const mockGetFileMetadata = vi.fn(async (url: string) => {
  const file = uploadedFiles.get(url)
  if (!file) {
    throw new Error("File not found")
  }
  return {
    url: file.url,
    pathname: file.pathname,
    size: 1024,
    uploadedAt: new Date(),
  }
})

export const mockComputeContentHash = vi.fn(async (file: File) => {
  // Return a deterministic hash based on file name for testing
  return `hash-${file.name}-${file.size}`
})

// ============================================================================
// Setup & Cleanup
// ============================================================================

export function clearMockBlob(): void {
  uploadedFiles = new Map()
  uploadCounter = 0
  mockUploadFile.mockClear()
  mockDeleteFile.mockClear()
  mockGetFileMetadata.mockClear()
  mockComputeContentHash.mockClear()
}

/**
 * Creates the mock object for vi.mock("@/lib/blob", ...).
 */
export function createBlobMock() {
  return {
    uploadFile: mockUploadFile,
    deleteFile: mockDeleteFile,
    getFileMetadata: mockGetFileMetadata,
    computeContentHash: mockComputeContentHash,
  }
}
