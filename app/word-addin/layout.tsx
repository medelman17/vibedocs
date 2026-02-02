import type { Metadata } from "next"
import Script from "next/script"
import "@/app/globals.css"
import { Providers } from "./providers"

export const metadata: Metadata = {
  title: "NDA Analyst - Word Add-in",
  description: "Analyze NDAs directly in Microsoft Word",
}

/**
 * History API polyfill for Office.js sandboxed iframe.
 * Office Add-ins run in a restricted iframe that doesn't support
 * window.history.pushState/replaceState, which Next.js App Router needs.
 */
const historyPolyfill = `
(function() {
  if (typeof window !== 'undefined') {
    // Check if we're in an Office Add-in context (history APIs may be restricted)
    if (typeof window.history.pushState !== 'function') {
      window.history.pushState = function() {};
    }
    if (typeof window.history.replaceState !== 'function') {
      window.history.replaceState = function() {};
    }
  }
})();
`

export default function WordAddInLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <head>
        {/* History polyfill must run before any Next.js code */}
        <script dangerouslySetInnerHTML={{ __html: historyPolyfill }} />
        <Script
          src="https://appsforoffice.microsoft.com/lib/1.1/hosted/office.js"
          strategy="beforeInteractive"
        />
      </head>
      <body className="bg-background text-foreground antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
