/**
 * @fileoverview Dataset Downloader
 *
 * Downloads and caches reference datasets from remote sources.
 * Supports both direct file downloads and zip extraction.
 *
 * @module lib/datasets/downloader
 */

import { mkdir, access, writeFile, stat } from "fs/promises"
import { join } from "path"
import AdmZip from "adm-zip"
import type { DatasetSource } from "./types"

const CACHE_DIR = ".cache/datasets"

const DATASET_URLS: Record<DatasetSource, string> = {
  cuad: "https://huggingface.co/datasets/cuad/resolve/main/CUAD_v1.parquet",
  contract_nli:
    "https://huggingface.co/datasets/kiddothe2b/contract-nli/resolve/main/train.json",
  bonterms: "https://github.com/Bonterms/Mutual-NDA/archive/refs/heads/main.zip",
  commonaccord: "https://github.com/CommonAccord/NW-NDA/archive/refs/heads/master.zip",
}

const DATASET_PATHS: Record<DatasetSource, string> = {
  cuad: "CUAD_v1.parquet",
  contract_nli: "contract_nli.json",
  bonterms: "bonterms-nda",
  commonaccord: "commonaccord-nda",
}

export interface DownloadResult {
  source: DatasetSource
  path: string
  cached: boolean
  sizeBytes: number
}

/**
 * Check if dataset is already cached
 */
export async function isDatasetCached(source: DatasetSource): Promise<boolean> {
  const path = getDatasetPath(source)
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

/**
 * Get local path for a dataset
 */
export function getDatasetPath(source: DatasetSource): string {
  return join(CACHE_DIR, DATASET_PATHS[source])
}

/**
 * Download a single dataset if not cached
 */
export async function downloadDataset(
  source: DatasetSource,
  forceRefresh = false
): Promise<DownloadResult> {
  await mkdir(CACHE_DIR, { recursive: true })

  const path = getDatasetPath(source)
  const cached = !forceRefresh && (await isDatasetCached(source))

  if (cached) {
    const fileStat = await stat(path)
    return { source, path, cached: true, sizeBytes: fileStat.size }
  }

  const url = DATASET_URLS[source]
  const response = await fetch(url)

  if (!response.ok) {
    throw new Error(
      `Failed to download ${source}: ${response.status} ${response.statusText}`
    )
  }

  // Handle zip files (Bonterms, CommonAccord)
  if (url.endsWith(".zip")) {
    await downloadAndExtractZip(response, path)
  } else {
    const buffer = await response.arrayBuffer()
    await writeFile(path, Buffer.from(buffer))
  }

  const fileStat = await stat(path)
  return { source, path, cached: false, sizeBytes: fileStat.size }
}

/**
 * Download and extract a zip file
 */
async function downloadAndExtractZip(
  response: Response,
  destDir: string
): Promise<void> {
  const buffer = await response.arrayBuffer()
  const zip = new AdmZip(Buffer.from(buffer))

  await mkdir(destDir, { recursive: true })
  zip.extractAllTo(destDir, true)
}

/**
 * Download all specified datasets
 */
export async function downloadAllDatasets(
  sources: DatasetSource[],
  forceRefresh = false
): Promise<DownloadResult[]> {
  const results: DownloadResult[] = []

  for (const source of sources) {
    const result = await downloadDataset(source, forceRefresh)
    results.push(result)
  }

  return results
}
