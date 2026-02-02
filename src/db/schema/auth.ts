/**
 * @fileoverview Auth.js v5 Compatible Database Schema for DrizzleAdapter
 *
 * This module defines the core authentication tables required by Auth.js (NextAuth.js v5)
 * when using the Drizzle ORM adapter. These tables handle user identity, OAuth provider
 * connections, session management, and email verification workflows.
 *
 * @description
 * The schema follows the Auth.js database model specification with customizations:
 * - Uses UUID primary keys (via `primaryId` helper) instead of default cuid
 * - Includes `passwordHash` field for credentials-based authentication
 * - Adds `activeOrganizationId` to sessions for multi-tenant context switching
 * - Includes audit timestamps (`createdAt`, `updatedAt`) on the users table
 *
 * @remarks
 * All tables use PostgreSQL-specific types and features:
 * - `uuid` for primary/foreign keys with `gen_random_uuid()` default
 * - `timestamp with time zone` for all datetime fields
 * - Cascade delete on foreign key relationships to maintain referential integrity
 *
 * @see {@link https://authjs.dev/getting-started/adapters/drizzle} - DrizzleAdapter documentation
 * @see {@link https://authjs.dev/concepts/database-models} - Auth.js database model specification
 * @see {@link https://orm.drizzle.team/docs/column-types/pg} - Drizzle PostgreSQL column types
 *
 * @module db/schema/auth
 */

import {
  pgTable,
  text,
  timestamp,
  uuid,
  primaryKey,
  integer,
} from "drizzle-orm/pg-core"
import { primaryId, timestamps } from "../_columns"

/**
 * Users table - Core identity store for all authenticated users.
 *
 * @description
 * The users table is the central identity record in the authentication system.
 * It stores basic profile information and is referenced by all other auth tables.
 * Users can authenticate via OAuth providers (linked through `accounts` table)
 * or via email/password credentials (using the `passwordHash` field).
 *
 * @remarks
 * - Email is the unique identifier and is required for all users
 * - OAuth users may not have a `passwordHash` (null for OAuth-only accounts)
 * - Credentials users must have a `passwordHash` (bcrypt hashed via `@/lib/password`)
 * - The `emailVerified` timestamp is set when the user confirms their email
 * - Profile fields (`name`, `image`) are populated from OAuth provider data or user input
 *
 * @example
 * ```typescript
 * // Query a user by email
 * const user = await db.query.users.findFirst({
 *   where: eq(users.email, "user@example.com")
 * });
 *
 * // Create a credentials user
 * const newUser = await db.insert(users).values({
 *   email: "user@example.com",
 *   passwordHash: await hashPassword("securepassword"),
 *   name: "John Doe"
 * }).returning();
 * ```
 *
 * @property {string} id - UUID primary key, auto-generated via `gen_random_uuid()`
 * @property {string | null} name - User's display name (from OAuth profile or user input)
 * @property {string} email - Unique email address, required for all auth flows
 * @property {Date | null} emailVerified - Timestamp when email was verified, null if unverified
 * @property {string | null} image - Profile image URL (typically from OAuth provider)
 * @property {string | null} passwordHash - Bcrypt hash for credentials auth, null for OAuth-only users
 * @property {Date} createdAt - Record creation timestamp (auto-set)
 * @property {Date} updatedAt - Last modification timestamp (auto-updated on changes)
 *
 * @see {@link https://authjs.dev/concepts/database-models#user} - Auth.js User model
 */
export const users = pgTable("users", {
  /** UUID primary key with auto-generation via gen_random_uuid() */
  ...primaryId,

  /** User's display name, populated from OAuth profile or user registration */
  name: text("name"),

  /** Unique email address - the primary identifier for authentication */
  email: text("email").unique().notNull(),

  /**
   * Timestamp indicating when the user's email was verified.
   * Null indicates the email has not been verified.
   * Set automatically by Auth.js when user clicks verification link.
   */
  emailVerified: timestamp("email_verified", { withTimezone: true }),

  /** Profile image URL, typically sourced from OAuth provider (Google, GitHub, etc.) */
  image: text("image"),

  /**
   * Bcrypt-hashed password for credentials authentication.
   * Null for users who only authenticate via OAuth providers.
   * Use `hashPassword()` from `@/lib/password` to set this value.
   * @see {@link module:lib/password} for hashing utilities
   */
  passwordHash: text("password_hash"),

  /**
   * Number of consecutive failed login attempts.
   * Reset to 0 on successful login or after lockout expires.
   * Used for account lockout security measure.
   */
  failedLoginAttempts: integer("failed_login_attempts").notNull().default(0),

  /**
   * Timestamp until which the account is locked.
   * Null when account is not locked.
   * Account can attempt login again after this time.
   */
  lockedUntil: timestamp("locked_until", { withTimezone: true }),

  /**
   * Timestamp of the user's last successful login.
   * Useful for security auditing and detecting inactive accounts.
   */
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),

  /**
   * IP address from the user's last successful login.
   * Useful for detecting suspicious login patterns.
   */
  lastLoginIp: text("last_login_ip"),

  /** Audit timestamps: createdAt (auto-set), updatedAt (auto-updated) */
  ...timestamps,
})

/**
 * Accounts table - Links users to OAuth provider accounts.
 *
 * @description
 * The accounts table stores OAuth provider connections for each user.
 * A single user can have multiple linked accounts (e.g., both Google and GitHub).
 * This enables users to sign in with any of their linked providers.
 *
 * @remarks
 * - Uses a composite primary key of (`provider`, `providerAccountId`) to ensure
 *   each OAuth account is linked to only one user
 * - The `userId` foreign key cascades on delete, removing all linked accounts
 *   when a user is deleted
 * - Token fields (`access_token`, `refresh_token`, etc.) are managed by Auth.js
 *   and should not be modified directly
 * - The `type` field distinguishes between OAuth, OIDC, and other account types
 *
 * @example
 * ```typescript
 * // Find all OAuth accounts for a user
 * const userAccounts = await db.query.accounts.findMany({
 *   where: eq(accounts.userId, userId)
 * });
 *
 * // Check if user has Google linked
 * const hasGoogle = userAccounts.some(a => a.provider === "google");
 * ```
 *
 * @property {string} userId - Foreign key to users table, cascades on delete
 * @property {string} type - Account type: "oauth" | "oidc" | "email" | "credentials"
 * @property {string} provider - OAuth provider identifier (e.g., "google", "github")
 * @property {string} providerAccountId - Unique ID from the OAuth provider
 * @property {string | null} refresh_token - OAuth refresh token for token renewal
 * @property {string | null} access_token - OAuth access token for API calls
 * @property {number | null} expires_at - Token expiration as Unix timestamp (seconds)
 * @property {string | null} token_type - Token type, typically "Bearer"
 * @property {string | null} scope - OAuth scopes granted (space-separated)
 * @property {string | null} id_token - OIDC ID token (JWT) for identity verification
 * @property {string | null} session_state - Provider session state for logout coordination
 *
 * @see {@link https://authjs.dev/concepts/database-models#account} - Auth.js Account model
 * @see {@link https://oauth.net/2/} - OAuth 2.0 specification
 */
export const accounts = pgTable(
  "accounts",
  {
    /**
     * Foreign key reference to the users table.
     * Cascades on delete to remove orphaned account links.
     */
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    /**
     * Account type indicating the authentication method.
     * Values: "oauth" (OAuth 2.0), "oidc" (OpenID Connect), "email", "credentials"
     */
    type: text("type").notNull(),

    /**
     * OAuth provider identifier.
     * Examples: "google", "github", "azure-ad", "auth0"
     * Must match the provider ID configured in Auth.js.
     */
    provider: text("provider").notNull(),

    /**
     * The user's unique identifier from the OAuth provider.
     * Combined with `provider`, forms the composite primary key.
     */
    providerAccountId: text("provider_account_id").notNull(),

    /**
     * OAuth refresh token for obtaining new access tokens.
     * May be null if provider doesn't support refresh tokens or offline access wasn't requested.
     */
    refresh_token: text("refresh_token"),

    /**
     * OAuth access token for making authenticated API requests to the provider.
     * Stored encrypted by Auth.js when encryption is enabled.
     */
    access_token: text("access_token"),

    /**
     * Token expiration time as Unix timestamp (seconds since epoch).
     * Used by Auth.js to determine when to refresh the access token.
     */
    expires_at: integer("expires_at"),

    /**
     * Token type returned by the OAuth provider.
     * Typically "Bearer" for most OAuth 2.0 implementations.
     */
    token_type: text("token_type"),

    /**
     * OAuth scopes that were granted during authorization.
     * Space-separated list (e.g., "openid email profile").
     */
    scope: text("scope"),

    /**
     * OpenID Connect ID token (JWT).
     * Contains identity claims about the authenticated user.
     * Only present for OIDC providers.
     */
    id_token: text("id_token"),

    /**
     * Provider's session state for coordinating logout.
     * Used for Single Sign-Out (SLO) implementations.
     */
    session_state: text("session_state"),
  },
  (account) => [
    /**
     * Composite primary key ensures each OAuth account can only be linked once.
     * A provider account cannot be associated with multiple users.
     */
    primaryKey({ columns: [account.provider, account.providerAccountId] }),
  ]
)

/**
 * Sessions table - Manages active user sessions with database storage.
 *
 * @description
 * The sessions table stores active authentication sessions when using
 * database session strategy (as opposed to JWT strategy). Each session
 * links a session token to a user and tracks expiration.
 *
 * @remarks
 * - Uses database sessions (not JWT) for better security and session control
 * - Session token is the primary key and is stored in the user's cookie
 * - The `activeOrganizationId` field is a custom extension for multi-tenant
 *   context switching, allowing users to switch between organizations
 * - Sessions are automatically cleaned up by Auth.js based on `expires` timestamp
 * - The `userId` foreign key cascades on delete, invalidating all sessions
 *   when a user is deleted
 *
 * @example
 * ```typescript
 * // Get session with active organization
 * const session = await db.query.sessions.findFirst({
 *   where: eq(sessions.sessionToken, token),
 *   with: { user: true }
 * });
 *
 * // Update active organization for a session
 * await db.update(sessions)
 *   .set({ activeOrganizationId: newOrgId })
 *   .where(eq(sessions.sessionToken, token));
 * ```
 *
 * @property {string} sessionToken - Primary key, opaque token stored in session cookie
 * @property {string} userId - Foreign key to users table, cascades on delete
 * @property {Date} expires - Session expiration timestamp, after which session is invalid
 * @property {string | null} activeOrganizationId - Currently selected organization for multi-tenant context
 *
 * @see {@link https://authjs.dev/concepts/database-models#session} - Auth.js Session model
 * @see {@link https://authjs.dev/concepts/session-strategies} - Session strategies comparison
 */
export const sessions = pgTable("sessions", {
  /**
   * Opaque session token serving as the primary key.
   * This token is stored in the user's browser cookie and used
   * to look up the session on each request.
   */
  sessionToken: text("session_token").primaryKey(),

  /**
   * Foreign key reference to the authenticated user.
   * Cascades on delete to invalidate all sessions when user is removed.
   */
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),

  /**
   * Session expiration timestamp.
   * After this time, the session is considered invalid and Auth.js
   * will require re-authentication.
   */
  expires: timestamp("expires", { withTimezone: true }).notNull(),

  /**
   * Currently active organization ID for multi-tenant context.
   * This is a custom extension to the Auth.js session model.
   * Used by the DAL (`withTenant()`) to scope queries to the correct tenant.
   * Null when user hasn't selected an organization or is in a personal context.
   * @see {@link module:lib/dal} for tenant context utilities
   */
  activeOrganizationId: uuid("active_organization_id"),
})

/**
 * Verification Tokens table - Stores tokens for email verification and magic links.
 *
 * @description
 * The verificationTokens table stores short-lived tokens used for email-based
 * authentication flows, including email verification and magic link sign-in.
 * Tokens are single-use and expire after a configured duration.
 *
 * @remarks
 * - Uses a composite primary key of (`identifier`, `token`) to support
 *   multiple pending verifications per identifier
 * - The `identifier` is typically the user's email address
 * - Tokens are cryptographically random and should be treated as secrets
 * - Auth.js automatically deletes tokens after use or expiration
 * - This table is not linked to users via foreign key because tokens
 *   may exist for users who don't have accounts yet (magic link sign-up)
 *
 * @example
 * ```typescript
 * // Verify a token (typically handled by Auth.js)
 * const verificationToken = await db.query.verificationTokens.findFirst({
 *   where: and(
 *     eq(verificationTokens.identifier, email),
 *     eq(verificationTokens.token, token),
 *     gt(verificationTokens.expires, new Date())
 *   )
 * });
 * ```
 *
 * @property {string} identifier - The target of verification, typically an email address
 * @property {string} token - Cryptographically random verification token
 * @property {Date} expires - Token expiration timestamp, after which token is invalid
 *
 * @see {@link https://authjs.dev/concepts/database-models#verificationtoken} - Auth.js VerificationToken model
 * @see {@link https://authjs.dev/getting-started/providers/email} - Email provider documentation
 */
export const verificationTokens = pgTable(
  "verification_tokens",
  {
    /**
     * Identifier for the verification target.
     * Typically the user's email address for email verification
     * or magic link authentication flows.
     */
    identifier: text("identifier").notNull(),

    /**
     * Cryptographically random token sent to the user.
     * Generated by Auth.js and included in verification URLs.
     * Single-use: deleted after successful verification.
     */
    token: text("token").notNull(),

    /**
     * Token expiration timestamp.
     * Tokens are invalid after this time and will be rejected.
     * Default expiration is configured in Auth.js provider settings.
     */
    expires: timestamp("expires", { withTimezone: true }).notNull(),
  },
  (vt) => [
    /**
     * Composite primary key allows multiple tokens per identifier.
     * This supports scenarios where a user requests multiple
     * verification emails before using any of them.
     */
    primaryKey({ columns: [vt.identifier, vt.token] }),
  ]
)
