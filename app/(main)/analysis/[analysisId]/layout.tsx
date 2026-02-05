import { verifySession } from "@/lib/dal"
import { ChatLayoutClient } from "@/app/(main)/chat/chat-layout-client"
import type { User } from "@/components/shell"

/**
 * Layout for /analysis/[analysisId] route.
 *
 * Reuses ChatLayoutClient to provide the sidebar, header, and auth context.
 * The ChatLayoutClient is generic (sidebar + header shell) despite its name;
 * it works for any page under (main)/ that needs the sidebar chrome.
 */
export default async function AnalysisLayout({ children }: { children: React.ReactNode }) {
  const { user: sessionUser } = await verifySession()

  const user: User = {
    id: sessionUser.id,
    name: sessionUser.name || "User",
    email: sessionUser.email,
    avatar: sessionUser.image || undefined,
  }

  return <ChatLayoutClient user={user}>{children}</ChatLayoutClient>
}
