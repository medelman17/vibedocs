"use client"

import * as React from "react"
import { FileTextIcon, DownloadIcon, ExternalLinkIcon, Loader2Icon } from "lucide-react"
import { cn } from "@/lib/utils"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"

interface DocumentViewerProps {
  documentId: string
  className?: string
}

// Mock document data for demo
const MOCK_DOCUMENTS: Record<
  string,
  { title: string; type: string; pages: number; content: string }
> = {
  "demo-doc": {
    title: "Sample NDA Agreement",
    type: "PDF",
    pages: 5,
    content: `NON-DISCLOSURE AGREEMENT

This Non-Disclosure Agreement ("Agreement") is entered into as of the date last signed below (the "Effective Date") by and between:

Party A: VibeDocs Inc.
Party B: Demo Company LLC

WHEREAS, the parties wish to explore a potential business relationship and, in connection therewith, may disclose confidential information to each other.

NOW, THEREFORE, in consideration of the mutual covenants and agreements hereinafter set forth, the parties agree as follows:

1. DEFINITION OF CONFIDENTIAL INFORMATION
"Confidential Information" means any information, technical data, or know-how, including but not limited to:
- Business plans and strategies
- Financial information
- Customer lists and data
- Technical specifications
- Source code and algorithms

2. OBLIGATIONS OF RECEIVING PARTY
The Receiving Party agrees to:
a) Hold the Confidential Information in strict confidence
b) Not disclose any Confidential Information to third parties
c) Use the Confidential Information only for the Purpose
d) Protect the Confidential Information using reasonable measures

3. TERM
This Agreement shall remain in effect for a period of three (3) years from the Effective Date.

4. RETURN OF INFORMATION
Upon termination or upon request, all Confidential Information shall be returned or destroyed.

5. GOVERNING LAW
This Agreement shall be governed by the laws of the State of Delaware.

[Signature blocks would appear here]`,
  },
}

export function DocumentViewer({ documentId, className }: DocumentViewerProps) {
  const [loading, setLoading] = React.useState(true)
  const document = MOCK_DOCUMENTS[documentId]

  // Simulate loading
  React.useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 800)
    return () => clearTimeout(timer)
  }, [documentId])

  if (loading) {
    return (
      <div
        className={cn(
          "flex h-full flex-col items-center justify-center",
          className
        )}
      >
        <Loader2Icon className="size-8 animate-spin text-violet-500" />
        <p className="mt-4 text-sm text-muted-foreground">Loading document...</p>
      </div>
    )
  }

  if (!document) {
    return (
      <div
        className={cn(
          "flex h-full flex-col items-center justify-center p-8",
          "text-center",
          className
        )}
      >
        <div className="mb-4 rounded-full bg-neutral-100 p-4">
          <FileTextIcon className="size-8 text-neutral-400" />
        </div>
        <h3 className="mb-2 text-lg font-medium text-neutral-900">
          Document Not Found
        </h3>
        <p className="text-sm text-neutral-500">
          The requested document could not be loaded.
        </p>
        <p className="mt-2 font-mono text-xs text-neutral-400">ID: {documentId}</p>
      </div>
    )
  }

  return (
    <div className={cn("flex h-full flex-col", className)}>
      {/* Document info bar */}
      <div className="flex items-center justify-between border-b bg-muted/50 px-4 py-2">
        <div className="flex items-center gap-2">
          <FileTextIcon className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">{document.title}</span>
          <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
            {document.type}
          </span>
          <span className="text-xs text-muted-foreground">
            {document.pages} pages
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon-sm" disabled>
            <DownloadIcon className="size-4" />
          </Button>
          <Button variant="ghost" size="icon-sm" disabled>
            <ExternalLinkIcon className="size-4" />
          </Button>
        </div>
      </div>

      {/* Document content */}
      <ScrollArea className="flex-1">
        <div className="mx-auto max-w-2xl p-6">
          <div className="rounded-lg border bg-white p-8 shadow-sm">
            <pre className="whitespace-pre-wrap font-serif text-sm leading-relaxed text-neutral-800">
              {document.content}
            </pre>
          </div>
        </div>
      </ScrollArea>
    </div>
  )
}
