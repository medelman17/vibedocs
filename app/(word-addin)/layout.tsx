import type { Metadata } from "next"
import Script from "next/script"
import "@/app/(main)/globals.css"
import { Providers } from "./word-addin/providers"

export const metadata: Metadata = {
  title: "NDA Analyst - Word Add-in",
  description: "Analyze NDAs directly in Microsoft Word",
}

/**
 * History API polyfill for Office.js sandboxed iframe.
 * Office Add-ins run in a restricted iframe that doesn't support
 * window.history.pushState/replaceState, which Next.js App Router needs.
 * We use Object.defineProperty to ensure the methods are properly defined
 * and bound to the history object.
 */
const historyPolyfill = `
(function() {
  if (typeof window !== 'undefined' && window.history) {
    var noop = function(state, title, url) { return undefined; };
    try {
      Object.defineProperty(window.history, 'pushState', {
        value: noop,
        writable: true,
        configurable: true
      });
      Object.defineProperty(window.history, 'replaceState', {
        value: noop,
        writable: true,
        configurable: true
      });
    } catch (e) {
      // Fallback for environments where defineProperty fails
      window.history.pushState = noop;
      window.history.replaceState = noop;
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
