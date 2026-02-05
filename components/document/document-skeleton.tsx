import { Skeleton } from "@/components/ui/skeleton"

/**
 * Skeleton loader for the document rendering panel.
 * Shows a paper-like container with text line placeholders during data fetch.
 */
export function DocumentSkeleton() {
  return (
    <div className="flex h-full flex-col">
      {/* Header skeleton */}
      <div className="flex items-center gap-3 border-b px-4 py-3">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-4 w-20" />
        <Skeleton className="ml-auto h-5 w-16 rounded-full" />
      </div>

      {/* Toolbar skeleton */}
      <div className="flex items-center gap-3 border-b bg-muted/50 px-4 py-2">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-5 w-8 rounded-full" />
        <Skeleton className="ml-auto h-5 w-20" />
      </div>

      {/* Paper content skeleton */}
      <div className="flex-1 overflow-hidden p-6">
        <div className="mx-auto max-w-3xl rounded-lg border bg-card px-8 py-10 shadow-sm">
          {/* Title line */}
          <Skeleton className="mb-6 h-6 w-3/4" />

          {/* Paragraph lines with varying widths */}
          <div className="space-y-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-[95%]" />
            <Skeleton className="h-4 w-[88%]" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-[72%]" />
          </div>

          {/* Section heading */}
          <Skeleton className="mt-8 mb-4 h-5 w-1/2" />

          {/* More lines */}
          <div className="space-y-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-[92%]" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-[85%]" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-[60%]" />
          </div>

          {/* Another section */}
          <Skeleton className="mt-8 mb-4 h-5 w-2/5" />

          <div className="space-y-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-[90%]" />
            <Skeleton className="h-4 w-[78%]" />
          </div>
        </div>
      </div>
    </div>
  )
}
