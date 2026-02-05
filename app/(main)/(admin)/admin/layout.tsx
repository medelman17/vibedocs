import { requireRole } from "@/lib/dal"

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  await requireRole(["admin", "owner"])

  return (
    <div className="flex h-full flex-col">
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  )
}
