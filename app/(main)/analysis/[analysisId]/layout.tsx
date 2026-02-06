import { withTenant } from "@/lib/dal"
import { AnalysisShell, type AnalysisShellUser } from "@/components/analysis/analysis-shell"

/**
 * Layout for /analysis/[analysisId] route.
 *
 * Uses AnalysisShell — a minimal sidebar (nav + user menu) with a
 * full-viewport content area sized for the resizable document/analysis panels.
 */
export default async function AnalysisLayout({ children }: { children: React.ReactNode }) {
  const { user: sessionUser, role } = await withTenant()

  const user: AnalysisShellUser = {
    id: sessionUser.id,
    name: sessionUser.name || "User",
    email: sessionUser.email,
    avatar: sessionUser.image || undefined,
  }

  return (
    <AnalysisShell user={user} userRole={role}>
      {children}
    </AnalysisShell>
  )
}
