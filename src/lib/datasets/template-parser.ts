/**
 * @fileoverview Template Dataset Parser
 *
 * Parses markdown template directories (Bonterms, CommonAccord)
 * and yields normalized records at template and section granularities.
 *
 * @module lib/datasets/template-parser
 */

import { readFile, readdir } from "fs/promises"
import { join, basename } from "path"
import type { NormalizedRecord, DatasetSource } from "./types"
import { generateContentHash, normalizeText, parseHeading, buildSectionPath } from "./utils"

interface TemplateSection {
  heading: string
  level: number
  content: string
  path: string[]
}

/**
 * Parse a markdown template into sections
 */
export function parseMarkdownTemplate(markdown: string): TemplateSection[] {
  const lines = markdown.split("\n")
  const sections: TemplateSection[] = []
  const headingHistory: Array<{ level: number; text: string }> = []

  let currentSection: TemplateSection | null = null
  let contentLines: string[] = []

  for (const line of lines) {
    const heading = parseHeading(line)

    if (heading) {
      // Save previous section
      if (currentSection) {
        currentSection.content = normalizeText(contentLines.join("\n"))
        if (currentSection.content) {
          sections.push(currentSection)
        }
      }

      // Update heading history (remove deeper levels)
      while (
        headingHistory.length > 0 &&
        headingHistory[headingHistory.length - 1].level >= heading.level
      ) {
        headingHistory.pop()
      }
      headingHistory.push(heading)

      // Start new section
      currentSection = {
        heading: heading.text,
        level: heading.level,
        content: "",
        path: buildSectionPath(headingHistory, heading.level, heading.text),
      }
      contentLines = []
    } else if (currentSection) {
      contentLines.push(line)
    }
  }

  // Don't forget last section
  if (currentSection) {
    currentSection.content = normalizeText(contentLines.join("\n"))
    if (currentSection.content) {
      sections.push(currentSection)
    }
  }

  return sections
}

/**
 * Parse a directory of markdown templates
 */
async function* parseTemplateDirectory(
  dirPath: string,
  source: DatasetSource
): AsyncGenerator<NormalizedRecord> {
  const entries = await readdir(dirPath, { withFileTypes: true, recursive: true })

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) continue

    const filePath = join(entry.parentPath || dirPath, entry.name)
    const relativePath = filePath.replace(dirPath, "").replace(/^\//, "")
    const templateName = basename(entry.name, ".md")

    const content = await readFile(filePath, "utf-8")
    const normalizedContent = normalizeText(content)

    // Yield template-level record (full document)
    yield {
      source,
      sourceId: `${source}:template:${relativePath}`,
      content: normalizedContent,
      granularity: "template",
      sectionPath: [templateName],
      metadata: {
        fileName: entry.name,
        relativePath,
      },
      contentHash: generateContentHash(normalizedContent),
    }

    // Yield section-level records
    const sections = parseMarkdownTemplate(content)
    for (let i = 0; i < sections.length; i++) {
      const section = sections[i]

      yield {
        source,
        sourceId: `${source}:section:${relativePath}:${i}`,
        content: section.content,
        granularity: "section",
        sectionPath: [templateName, ...section.path],
        category: section.heading,
        metadata: {
          fileName: entry.name,
          relativePath,
          headingLevel: section.level,
          sectionIndex: i,
        },
        contentHash: generateContentHash(section.content),
      }
    }
  }
}

/**
 * Parse Bonterms template directory
 */
export async function* parseBontermsDataset(
  dirPath: string
): AsyncGenerator<NormalizedRecord> {
  yield* parseTemplateDirectory(dirPath, "bonterms")
}

/**
 * Parse CommonAccord template directory
 */
export async function* parseCommonAccordDataset(
  dirPath: string
): AsyncGenerator<NormalizedRecord> {
  yield* parseTemplateDirectory(dirPath, "commonaccord")
}

/**
 * Get template dataset statistics
 */
export async function getTemplateStats(
  dirPath: string,
  source: DatasetSource
): Promise<{
  totalTemplates: number
  totalSections: number
  avgSectionsPerTemplate: number
}> {
  let totalTemplates = 0
  let totalSections = 0

  const parser =
    source === "bonterms" ? parseBontermsDataset : parseCommonAccordDataset

  for await (const record of parser(dirPath)) {
    if (record.granularity === "template") {
      totalTemplates++
    } else if (record.granularity === "section") {
      totalSections++
    }
  }

  return {
    totalTemplates,
    totalSections,
    avgSectionsPerTemplate: totalTemplates > 0 ? totalSections / totalTemplates : 0,
  }
}
