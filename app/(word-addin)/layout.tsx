import type { Metadata } from "next"
import "./word-addin.css"
import { Providers } from "./word-addin/providers"
import { HistoryPolyfill } from "./history-polyfill"

export const metadata: Metadata = {
  title: "VibeDocs - Word Add-in",
  description: "Analyze NDAs directly in Microsoft Word",
}

export default function WordAddInLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="word-addin-root">
      <HistoryPolyfill />
      {/*
        Office.js is loaded dynamically in Providers to support dev mode.
        In dev mode (?dev=true), Office.js is not loaded to preserve
        the browser's native history API that Next.js needs.
      */}
      <Providers>{children}</Providers>
    </div>
  )
}
