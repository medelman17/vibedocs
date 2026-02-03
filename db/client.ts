/**
 * Neon Serverless Database Client
 *
 * This module provides the configured Drizzle ORM client connected to a Neon
 * PostgreSQL database via the serverless HTTP driver. The client is optimized
 * for serverless and edge runtime environments (Vercel Edge Functions,
 * Cloudflare Workers, etc.) where traditional TCP connections are not available.
 *
 * @remarks
 * The Neon serverless driver uses HTTP to communicate with the database,
 * making it compatible with edge runtimes that don't support raw TCP sockets.
 * Each query is an independent HTTP request, which provides automatic
 * connection pooling without manual connection management.
 *
 * @see {@link https://neon.tech/docs/serverless/serverless-driver} Neon Serverless Driver
 * @see {@link https://orm.drizzle.team/docs/get-started-postgresql#neon} Drizzle + Neon Setup
 *
 * @module db/client
 */

import { neon } from "@neondatabase/serverless"
import { drizzle } from "drizzle-orm/neon-http"
import * as schema from "./schema"

const sql = neon(process.env.DATABASE_URL!)

/**
 * Pre-configured Drizzle ORM database client instance.
 *
 * This client is initialized with the full application schema, enabling:
 * - Type-safe queries with full IntelliSense support
 * - Relational queries via `db.query.<tableName>` (e.g., `db.query.users.findFirst()`)
 * - Direct SQL operations via `db.select()`, `db.insert()`, `db.update()`, `db.delete()`
 *
 * @example
 * ```typescript
 * import { db } from "@/db/client"
 *
 * // Relational query with relations
 * const user = await db.query.users.findFirst({
 *   where: eq(users.id, userId),
 *   with: { organizations: true }
 * })
 *
 * // Direct query builder
 * const docs = await db
 *   .select()
 *   .from(documents)
 *   .where(eq(documents.tenantId, tenantId))
 * ```
 */
export const db = drizzle(sql, { schema })

/**
 * Type representing the Drizzle database client instance.
 *
 * Use this type when you need to pass the database client as a parameter
 * or store it in a context/dependency injection container.
 *
 * @example
 * ```typescript
 * import type { Database } from "@/db/client"
 *
 * function createRepository(db: Database) {
 *   return {
 *     findById: (id: string) => db.query.users.findFirst({
 *       where: eq(users.id, id)
 *     })
 *   }
 * }
 * ```
 */
export type Database = typeof db
