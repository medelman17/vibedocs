/**
 * @fileoverview Loading skeleton for admin documents page
 *
 * Displays a skeleton UI while data is being fetched.
 *
 * @module app/(admin)/admin/loading
 */

import { Skeleton } from "@/components/ui/skeleton"

export default function AdminDocumentsLoading() {
  return (
    <div className="p-6 space-y-4">
      {/* Header skeleton */}
      <div className="flex items-center gap-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-6 w-12 rounded-full" />
      </div>

      {/* Toolbar skeleton */}
      <div className="flex items-center gap-2">
        <Skeleton className="h-9 flex-1 max-w-[400px]" />
        <Skeleton className="h-9 w-[160px]" />
        <Skeleton className="h-9 w-[120px]" />
        <Skeleton className="h-9 w-[140px]" />
      </div>

      {/* Table skeleton */}
      <div className="border rounded-md">
        <div className="p-4 space-y-3">
          {/* Header row */}
          <div className="flex items-center gap-4 pb-3 border-b">
            <Skeleton className="h-4 w-4" />
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-20" />
          </div>

          {/* Data rows */}
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 py-3">
              <Skeleton className="h-4 w-4" />
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-20" />
            </div>
          ))}
        </div>
      </div>

      {/* Pagination skeleton */}
      <div className="flex items-center justify-between px-2">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-9 w-80" />
        <Skeleton className="h-9 w-40" />
      </div>
    </div>
  )
}
