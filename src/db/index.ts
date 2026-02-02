/**
 * Database Module - Barrel Export
 *
 * This is the primary entry point for all database-related imports. It
 * consolidates exports from the client, schema, and queries submodules
 * into a single import path for convenience.
 *
 * @remarks
 * Import from `@/db` for most use cases. Only import from submodules
 * directly when you need to avoid circular dependencies or want to
 * limit the scope of imports.
 *
 * @example
 * ```typescript
 * // Recommended: Import everything from the barrel
 * import { db, users, documents, queries } from "@/db"
 *
 * // Get the database client
 * const result = await db.query.users.findFirst()
 *
 * // Use schema tables directly
 * await db.insert(documents).values({ ... })
 *
 * // Use pre-built queries
 * const docs = await queries.documents.findByTenant(tenantId)
 * ```
 *
 * @example
 * ```typescript
 * // Alternative: Import specific items from submodules
 * import { db } from "@/db/client"
 * import { users, documents } from "@/db/schema"
 * import * as documentQueries from "@/db/queries/documents"
 * ```
 *
 * ## Available Exports
 *
 * - **From `./client`**: `db` (Drizzle client instance), `Database` (type)
 * - **From `./schema`**: All table definitions, relations, and schema types
 * - **From `./queries`**: Namespaced as `queries.*` - pre-built query functions
 *
 * @module db
 */

export * from "./client"
export * from "./schema"
export * as queries from "./queries"
