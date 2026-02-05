import { withTenant } from "@/lib/dal"
import { ChatLayoutClient } from "./chat-layout-client"
import type { User } from "@/components/shell"

export default async function ChatLayout({ children }: { children: React.ReactNode }) {
  const { user: sessionUser, role } = await withTenant()

  // Map session user to AppSidebar User type
  const user: User = {
    id: sessionUser.id,
    name: sessionUser.name || "User",
    email: sessionUser.email,
    avatar: sessionUser.image || undefined,
  }

  return <ChatLayoutClient user={user} userRole={role}>{children}</ChatLayoutClient>
}
