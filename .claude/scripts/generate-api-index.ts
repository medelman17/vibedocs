/**
 * @fileoverview Generate API index from TypeScript source files
 *
 * This script parses TypeScript files and extracts exported symbols
 * with their JSDoc descriptions to create a compact API reference
 * for LLM subagents.
 *
 * Usage:
 *   pnpm generate:api-index
 *   npx tsx .claude/scripts/generate-api-index.ts
 */

import * as ts from "typescript"
import * as fs from "fs"
import * as path from "path"

// Files to index (Phase 1 scope)
const FILES_TO_INDEX = [
  // Database
  "db/_columns.ts",
  "db/queries/documents.ts",
  "db/queries/analyses.ts",
  "db/queries/similarity.ts",
  // API utilities
  "lib/errors.ts",
  "lib/api-utils.ts",
  "lib/dal.ts",
  // Inngest
  "inngest/utils/errors.ts",
  "inngest/utils/rate-limit.ts",
  "inngest/utils/concurrency.ts",
  "inngest/utils/tenant-context.ts",
]

const PROJECT_ROOT = path.resolve(__dirname, "../..")
const OUTPUT_FILE = path.resolve(__dirname, "../generated/api-index.md")

interface ExportedSymbol {
  name: string
  kind: "function" | "class" | "type" | "const" | "variable"
  signature?: string
  description: string
}

interface FileIndex {
  relativePath: string
  symbols: ExportedSymbol[]
}

/**
 * Extract the first line/sentence of a JSDoc comment
 */
function extractDescription(node: ts.Node, _sourceFile: ts.SourceFile): string {
  const jsdoc = (node as { jsDoc?: ts.JSDoc[] }).jsDoc
  if (jsdoc && jsdoc.length > 0) {
    const comment = jsdoc[0].comment
    if (typeof comment === "string") {
      // Get first sentence or first line
      const firstSentence = comment.split(/[.\n]/)[0].trim()
      return firstSentence || comment.substring(0, 100)
    }
    if (Array.isArray(comment)) {
      const text = comment.map((c) => (typeof c === "string" ? c : c.text)).join("")
      const firstSentence = text.split(/[.\n]/)[0].trim()
      return firstSentence || text.substring(0, 100)
    }
  }

  // Fall back to inferring from name
  return ""
}

/**
 * Get function signature (simplified)
 */
function getFunctionSignature(
  node: ts.FunctionDeclaration | ts.ArrowFunction | ts.FunctionExpression,
  sourceFile: ts.SourceFile
): string {
  const params: string[] = []

  const parameters = node.parameters
  for (const param of parameters) {
    const name = param.name.getText(sourceFile)
    const type = param.type ? param.type.getText(sourceFile) : "unknown"
    const optional = param.questionToken ? "?" : ""
    params.push(`${name}${optional}: ${type}`)
  }

  return `(${params.join(", ")})`
}

/**
 * Parse a TypeScript file and extract exported symbols
 */
function parseFile(filePath: string): FileIndex | null {
  const absolutePath = path.resolve(PROJECT_ROOT, filePath)

  if (!fs.existsSync(absolutePath)) {
    console.warn(`File not found: ${absolutePath}`)
    return null
  }

  const content = fs.readFileSync(absolutePath, "utf-8")
  const sourceFile = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true)

  const symbols: ExportedSymbol[] = []

  function visit(node: ts.Node) {
    // Check if node has export modifier
    const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined
    const isExported = modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)

    if (!isExported) {
      ts.forEachChild(node, visit)
      return
    }

    // Function declarations
    if (ts.isFunctionDeclaration(node) && node.name) {
      const name = node.name.getText(sourceFile)
      const signature = getFunctionSignature(node, sourceFile)
      const description = extractDescription(node, sourceFile)

      symbols.push({
        name,
        kind: "function",
        signature,
        description: description || `Function ${name}`,
      })
    }

    // Variable declarations (including arrow functions and consts)
    if (ts.isVariableStatement(node)) {
      for (const decl of node.declarationList.declarations) {
        if (ts.isIdentifier(decl.name)) {
          const name = decl.name.getText(sourceFile)
          const description = extractDescription(node, sourceFile)

          // Check if it's an arrow function
          if (decl.initializer && ts.isArrowFunction(decl.initializer)) {
            const signature = getFunctionSignature(decl.initializer, sourceFile)
            symbols.push({
              name,
              kind: "function",
              signature,
              description: description || `Function ${name}`,
            })
          } else {
            symbols.push({
              name,
              kind: "const",
              description: description || `Constant ${name}`,
            })
          }
        }
      }
    }

    // Class declarations
    if (ts.isClassDeclaration(node) && node.name) {
      const name = node.name.getText(sourceFile)
      const description = extractDescription(node, sourceFile)

      symbols.push({
        name,
        kind: "class",
        description: description || `Class ${name}`,
      })
    }

    // Type aliases
    if (ts.isTypeAliasDeclaration(node)) {
      const name = node.name.getText(sourceFile)
      const description = extractDescription(node, sourceFile)

      symbols.push({
        name,
        kind: "type",
        description: description || `Type ${name}`,
      })
    }

    // Interface declarations
    if (ts.isInterfaceDeclaration(node)) {
      const name = node.name.getText(sourceFile)
      const description = extractDescription(node, sourceFile)

      symbols.push({
        name,
        kind: "type",
        description: description || `Interface ${name}`,
      })
    }

    ts.forEachChild(node, visit)
  }

  visit(sourceFile)

  return {
    relativePath: filePath,
    symbols,
  }
}

/**
 * Format a symbol for markdown output
 */
function formatSymbol(symbol: ExportedSymbol): string {
  const signature = symbol.signature || ""
  const nameWithSig = signature ? `${symbol.name}${signature}` : symbol.name

  return `- \`${nameWithSig}\` - ${symbol.description}`
}

/**
 * Generate the markdown index
 */
function generateMarkdown(indexes: FileIndex[]): string {
  const lines: string[] = []

  lines.push("# API Index")
  lines.push("")
  lines.push(`Generated: ${new Date().toISOString()}`)
  lines.push("")
  lines.push("This file is auto-generated. Do not edit manually.")
  lines.push("Regenerate with: `pnpm generate:api-index`")
  lines.push("")

  for (const index of indexes) {
    if (index.symbols.length === 0) continue

    lines.push(`## ${index.relativePath}`)
    lines.push("")

    for (const symbol of index.symbols) {
      lines.push(formatSymbol(symbol))
    }

    lines.push("")
  }

  return lines.join("\n")
}

/**
 * Main entry point
 */
function main() {
  console.log("Generating API index...")

  const indexes: FileIndex[] = []

  for (const file of FILES_TO_INDEX) {
    console.log(`  Parsing ${file}...`)
    const index = parseFile(file)
    if (index) {
      indexes.push(index)
    }
  }

  const markdown = generateMarkdown(indexes)

  // Ensure output directory exists
  const outputDir = path.dirname(OUTPUT_FILE)
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true })
  }

  fs.writeFileSync(OUTPUT_FILE, markdown)
  console.log(`\nGenerated: ${OUTPUT_FILE}`)
  console.log(`Total symbols indexed: ${indexes.reduce((sum, i) => sum + i.symbols.length, 0)}`)
}

main()
