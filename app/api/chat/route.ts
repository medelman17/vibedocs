import { streamText, convertToModelMessages, UIMessage, tool, stepCountIs } from "ai"
import { gateway } from "ai"
import { withTenant } from "@/lib/dal"
import { vectorSearchTool } from "@/agents/tools/vector-search"
import {
  createConversationInternal,
  createMessageInternal,
  updateConversationTitleInternal,
} from "@/app/(main)/chat/actions"
import { z } from "zod"
import { nanoid } from "nanoid"

const model = gateway("anthropic/claude-sonnet-4")

export const maxDuration = 60

const SYSTEM_PROMPT = `You are VibeDocs, an AI assistant specialized in analyzing Non-Disclosure Agreements (NDAs).

Your capabilities:
- Help users understand NDA terms and clauses
- Explain legal concepts in plain language
- Answer questions about confidentiality, IP protection, and contract terms
- Guide users to upload documents for detailed analysis
- Search a comprehensive reference corpus of NDAs and legal clauses

You have access to a search_references tool that queries over 33,000 legal clauses from:
- CUAD (Contract Understanding Atticus Dataset) - 510 real NDAs
- ContractNLI - Contract natural language inference examples
- Bonterms - Standard NDA templates
- CommonAccord - Open-source legal templates
- Kleister - Contract analysis examples

When users ask about standard clauses, templates, or examples of NDA language, use the search tool to find relevant examples from the corpus. Always cite sources when using reference data.

When users say "Analyze NDA", guide them to upload a document using the + button in the chat input. Explain that once uploaded, VibeDocs will extract clauses, assess risks, and identify gaps.

When users say "Compare documents", explain they can upload two NDAs for side-by-side comparison, highlighting differences in key terms like confidentiality scope, IP rights, and termination clauses.

When users say "Generate NDA", explain this feature lets them create custom NDAs from professional templates (Bonterms, CommonAccord) by answering a few questions about their needs.

When users upload a document, a separate analysis pipeline will process it automatically. For text questions, provide helpful, accurate information about NDAs and contract law.

Keep responses concise and practical. If you're unsure about specific legal advice, recommend consulting a lawyer.

FORMATTING: When showing example clause language, use blockquotes (>) not code blocks. Legal text should be readable prose, not code.`

export async function POST(req: Request) {
  // Verify user is authenticated and get tenant context
  // IMPORTANT: Capture context BEFORE streaming starts - it won't be available in onFinish callback
  let tenantContext: { tenantId: string; userId: string }
  try {
    const ctx = await withTenant()
    tenantContext = { tenantId: ctx.tenantId as string, userId: ctx.userId as string }
  } catch {
    return new Response("Unauthorized", { status: 401 })
  }

  const {
    messages,
    conversationId,
  }: { messages: UIMessage[]; conversationId?: string } = await req.json()

  const result = streamText({
    model,
    system: SYSTEM_PROMPT,
    messages: await convertToModelMessages(messages),
    tools: {
      search_references: vectorSearchTool,
      showArtifact: tool({
        description:
          "Display content in the artifact panel. Use when showing analysis results, documents, or comparisons.",
        inputSchema: z.object({
          type: z.enum(["analysis", "document", "comparison"]),
          id: z.string().describe("The ID of the content to display"),
          title: z
            .string()
            .describe("Title to show in the artifact panel header"),
        }),
        // No execute function = client-side tool
      }),
    },
    stopWhen: stepCountIs(5),
  })

  return result.toUIMessageStreamResponse({
    originalMessages: messages,
    generateMessageId: () => nanoid(),
    onFinish: async ({ responseMessage }) => {
      try {
        if (!responseMessage) return

        let convId = conversationId

        // Create conversation if new
        if (!convId) {
          // Extract user content for title from the last user message
          const userMessage = messages[messages.length - 1]
          let userContent = ""
          if (userMessage?.parts) {
            const textPart = userMessage.parts.find(
              (p): p is { type: "text"; text: string } => p.type === "text"
            )
            userContent = textPart?.text || ""
          }
          const title = userContent.slice(0, 50) || "New chat"

          // Use internal function with pre-captured context (doesn't rely on request context)
          const convResult = await createConversationInternal({
            title,
            tenantId: tenantContext.tenantId,
            userId: tenantContext.userId,
          })
          if (convResult.success) {
            convId = convResult.data.id

            // Generate better title asynchronously (fire and forget)
            generateAndUpdateTitle(convId, userContent, tenantContext).catch(console.error)
          } else {
            console.error(
              "[chat/route] Failed to create conversation:",
              convResult.error
            )
            return
          }
        }

        // Persist user message (the one that triggered this response)
        const userMsg = messages[messages.length - 1]
        if (userMsg) {
          await createMessageInternal({
            conversationId: convId,
            role: "user",
            content: JSON.stringify(userMsg.parts || []),
            tenantId: tenantContext.tenantId,
            userId: tenantContext.userId,
          })
        }

        // Persist assistant response message
        await createMessageInternal({
          conversationId: convId,
          role: "assistant",
          content: JSON.stringify(responseMessage.parts || []),
          tenantId: tenantContext.tenantId,
          userId: tenantContext.userId,
        })
      } catch (error) {
        console.error("[chat/route] Failed to persist messages:", error)
      }
    },
  })
}

/**
 * Generate a better title using the model and update the conversation.
 */
async function generateAndUpdateTitle(
  conversationId: string,
  userMessage: string,
  tenantContext: { tenantId: string; userId: string }
): Promise<void> {
  if (!userMessage || userMessage.length < 10) return

  try {
    const { generateText } = await import("ai")
    const { text } = await generateText({
      model,
      system:
        "Generate a concise title (3-6 words) for a conversation that starts with this message. Return only the title, no quotes or punctuation.",
      prompt: userMessage.slice(0, 500),
      maxOutputTokens: 20,
    })

    const title = text.trim().slice(0, 50)
    if (title) {
      await updateConversationTitleInternal({
        conversationId,
        title,
        tenantId: tenantContext.tenantId,
        userId: tenantContext.userId,
      })
    }
  } catch (error) {
    console.error("[chat/route] Failed to generate title:", error)
  }
}
