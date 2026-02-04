#!/usr/bin/env npx tsx
/**
 * Test script for Word Add-in auth code flow
 *
 * Tests:
 * 1. Store a code in Redis
 * 2. Exchange it via API
 * 3. Verify one-time use (second exchange should fail)
 *
 * Usage:
 *   pnpm tsx scripts/test-auth-code-flow.ts [base-url]
 *
 * Examples:
 *   pnpm tsx scripts/test-auth-code-flow.ts                    # localhost:3000
 *   pnpm tsx scripts/test-auth-code-flow.ts https://vdocs.edel.sh  # production
 */

import { config } from "dotenv"
config({ path: ".env.local" })

import { Redis } from "@upstash/redis"

const BASE_URL = process.argv[2] || "http://localhost:3000"

// Initialize Redis client
const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
})

const KEY_PREFIX = "word-addin-auth:"
const CODE_EXPIRY_SECONDS = 60

interface CachedAuth {
  userId: string
  email: string
  name: string | null
  sessionToken: string
  createdAt: number
}

function generateCode(): string {
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  return Array.from(array, (b) => b.toString(16).padStart(2, "0")).join("")
}

async function storeTestCode(): Promise<{ code: string; data: CachedAuth }> {
  const code = generateCode()
  const data: CachedAuth = {
    userId: "test-user-123",
    email: "test@example.com",
    name: "Test User",
    sessionToken: "test-session-token-" + Date.now(),
    createdAt: Date.now(),
  }

  await redis.set(`${KEY_PREFIX}${code}`, JSON.stringify(data), {
    ex: CODE_EXPIRY_SECONDS,
  })

  return { code, data }
}

async function exchangeCode(
  code: string
): Promise<{ success: boolean; status: number; data?: unknown; error?: string }> {
  try {
    const response = await fetch(`${BASE_URL}/api/word-addin/exchange`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    })

    const data = await response.json()
    return {
      success: response.ok,
      status: response.status,
      data: response.ok ? data : undefined,
      error: response.ok ? undefined : data.error?.message || data.error,
    }
  } catch (e) {
    return {
      success: false,
      status: 0,
      error: e instanceof Error ? e.message : "Unknown error",
    }
  }
}

async function runTests() {
  console.log(`\n🧪 Testing auth code flow against: ${BASE_URL}\n`)

  // Test 1: Store and exchange a code
  console.log("Test 1: Store code in Redis and exchange via API")
  const { code, data } = await storeTestCode()
  console.log(`  ✓ Stored code: ${code.slice(0, 16)}...`)
  console.log(`  ✓ Test user: ${data.email}`)

  const result1 = await exchangeCode(code)
  if (result1.success) {
    console.log(`  ✓ Exchange succeeded (status: ${result1.status})`)
    console.log(`  ✓ Got user: ${JSON.stringify((result1.data as { data: { user: unknown } }).data.user)}`)
  } else {
    console.log(`  ✗ Exchange failed (status: ${result1.status})`)
    console.log(`  ✗ Error: ${result1.error}`)
    process.exit(1)
  }

  // Test 2: Try to exchange the same code again (should fail)
  console.log("\nTest 2: Verify one-time use (second exchange should fail)")
  const result2 = await exchangeCode(code)
  if (!result2.success && result2.status === 401) {
    console.log(`  ✓ Second exchange correctly rejected (status: ${result2.status})`)
    console.log(`  ✓ Error: ${result2.error}`)
  } else {
    console.log(`  ✗ Second exchange should have failed but got status: ${result2.status}`)
    process.exit(1)
  }

  // Test 3: Invalid code
  console.log("\nTest 3: Invalid code should fail")
  const result3 = await exchangeCode("invalid-code-12345")
  if (!result3.success && result3.status === 401) {
    console.log(`  ✓ Invalid code correctly rejected (status: ${result3.status})`)
  } else {
    console.log(`  ✗ Invalid code should have failed but got status: ${result3.status}`)
    process.exit(1)
  }

  // Test 4: Check Redis directly for cleanup
  console.log("\nTest 4: Verify code was deleted from Redis")
  const remaining = await redis.get(`${KEY_PREFIX}${code}`)
  if (remaining === null) {
    console.log("  ✓ Code was properly deleted from Redis")
  } else {
    console.log("  ✗ Code still exists in Redis (should have been deleted)")
    process.exit(1)
  }

  console.log("\n✅ All tests passed!\n")
}

runTests().catch((e) => {
  console.error("\n❌ Test failed with error:", e)
  process.exit(1)
})
