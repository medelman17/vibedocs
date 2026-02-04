import { streamText } from "ai"
import { gateway } from "ai"
import { verifySession } from "@/lib/dal"

const model = gateway("anthropic/claude-sonnet-4")

const SYSTEM_PROMPT = `You are VibeDocs, an AI assistant specialized in analyzing Non-Disclosure Agreements (NDAs).

Your capabilities:
- Help users understand NDA terms and clauses
- Explain legal concepts in plain language
- Answer questions about confidentiality, IP protection, and contract terms
- Guide users to upload documents for detailed analysis

When users upload a document, a separate analysis pipeline will process it. For text questions, provide helpful, accurate information about NDAs and contract law.

Keep responses concise and practical. If you're unsure about specific legal advice, recommend consulting a lawyer.`

export async function POST(req: Request) {
  // Verify user is authenticated
  try {
    await verifySession()
  } catch {
    return new Response("Unauthorized", { status: 401 })
  }

  const { messages } = await req.json()

  const result = streamText({
    model,
    system: SYSTEM_PROMPT,
    messages,
  })

  return result.toTextStreamResponse()
}
