"use server";

/**
 * @fileoverview Vercel Blob Storage Utilities
 *
 * This module provides utilities for file storage using Vercel Blob.
 * All functions are server-only and handle document uploads, deletions,
 * and metadata retrieval for the VibeDocs application.
 *
 * @module src/lib/blob
 */

import { put, del, head } from "@vercel/blob";

/**
 * Upload a file to Vercel Blob storage.
 *
 * @description
 * Uploads a file to Vercel Blob with a unique pathname structure
 * to prevent collisions: `{folder}/{uuid}/{filename}`
 *
 * The file is stored with public access for direct downloads.
 * Token is read from BLOB_READ_WRITE_TOKEN environment variable.
 *
 * @param file - The File object to upload
 * @param options - Upload options
 * @param options.folder - Optional folder prefix (e.g., "documents" or "exports")
 * @returns Object containing the blob URL, pathname, content type, and size
 *
 * @example
 * ```typescript
 * const result = await uploadFile(file, { folder: "documents" })
 * console.log(result.url) // https://xxx.public.blob.vercel-storage.com/documents/uuid/file.pdf
 * ```
 *
 * @throws Error if upload fails
 */
export async function uploadFile(
  file: File,
  options?: {
    folder?: string;
  }
): Promise<{
  url: string;
  pathname: string;
  contentType: string;
  size: number;
}> {
  // Generate unique pathname to prevent collisions
  const uniqueId = crypto.randomUUID();
  const folder = options?.folder ?? "uploads";
  const pathname = `${folder}/${uniqueId}/${file.name}`;

  const blob = await put(pathname, file, {
    access: "public",
    contentType: file.type,
  });

  return {
    url: blob.url,
    pathname: blob.pathname,
    contentType: file.type,
    size: file.size,
  };
}

/**
 * Delete a file from Vercel Blob storage.
 *
 * @description
 * Removes a file from blob storage using its URL.
 * This operation is idempotent - deleting a non-existent file does not throw.
 *
 * @param url - The full blob URL to delete
 *
 * @example
 * ```typescript
 * await deleteFile("https://xxx.public.blob.vercel-storage.com/documents/uuid/file.pdf")
 * ```
 */
export async function deleteFile(url: string): Promise<void> {
  await del(url);
}

/**
 * Get metadata for a blob file.
 *
 * @description
 * Retrieves metadata about a blob file without downloading its contents.
 * Returns null if the file does not exist.
 *
 * @param url - The full blob URL to inspect
 * @returns Object containing URL, pathname, content type, size, and upload date, or null if not found
 *
 * @example
 * ```typescript
 * const metadata = await getFileMetadata(url)
 * if (metadata) {
 *   console.log(`File size: ${metadata.size} bytes`)
 *   console.log(`Uploaded: ${metadata.uploadedAt}`)
 * }
 * ```
 */
export async function getFileMetadata(url: string): Promise<{
  url: string;
  pathname: string;
  contentType: string | null;
  size: number;
  uploadedAt: Date;
} | null> {
  try {
    const metadata = await head(url);

    return {
      url: metadata.url,
      pathname: metadata.pathname,
      contentType: metadata.contentType,
      size: metadata.size,
      uploadedAt: metadata.uploadedAt,
    };
  } catch (error) {
    // head() throws BlobNotFoundError if the blob doesn't exist
    if (
      error instanceof Error &&
      error.name === "BlobNotFoundError"
    ) {
      return null;
    }
    throw error;
  }
}

/**
 * Generate a SHA-256 content hash for deduplication.
 *
 * @description
 * Computes a SHA-256 hash of the file contents for deduplication purposes.
 * The hash is prefixed with "sha256:" for identification.
 *
 * Uses the Web Crypto API for efficient hashing.
 *
 * @param file - The File object to hash
 * @returns SHA-256 hash string prefixed with "sha256:"
 *
 * @example
 * ```typescript
 * const hash = await computeContentHash(file)
 * console.log(hash) // "sha256:abc123..."
 * ```
 */
export async function computeContentHash(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest("SHA-256", arrayBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  return `sha256:${hashHex}`;
}
