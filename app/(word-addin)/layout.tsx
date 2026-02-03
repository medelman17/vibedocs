import type { Metadata } from "next"
import "@/app/(main)/globals.css"
import { Providers } from "./word-addin/providers"

export const metadata: Metadata = {
  title: "VibeDocs - Word Add-in",
  description: "Analyze NDAs directly in Microsoft Word",
}

/**
 * History API polyfill for Office.js sandboxed iframe.
 *
 * Office Add-ins run in a sandboxed iframe where the history API is broken.
 * This polyfill detects broken history methods and replaces them with noops
 * so Next.js App Router doesn't crash.
 *
 * In dev mode (?dev=true), Office.js is not loaded, so the history API
 * works normally and no polyfill is needed.
 */
const historyPolyfill = `
(function() {
  if (typeof window === 'undefined' || !window.history) return;

  // In dev mode, Office.js won't be loaded, so history API is fine
  var isDevMode = window.location.search.indexOf('dev=true') !== -1;
  if (isDevMode) {
    console.log('[Word Add-in] Dev mode: native history API preserved');
    return;
  }

  // Test if history methods work (for Office sandbox detection)
  var needsPolyfill = false;
  try {
    if (typeof window.history.replaceState !== 'function') {
      needsPolyfill = true;
    } else {
      window.history.replaceState(null, '', window.location.href);
    }
  } catch (e) {
    needsPolyfill = true;
  }

  if (!needsPolyfill) {
    console.log('[Word Add-in] History API works normally');
    return;
  }

  console.log('[Word Add-in] Applying history polyfill for Office sandbox');
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
    window.history.pushState = noop;
    window.history.replaceState = noop;
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
        {/* History polyfill - handles dev mode and Office sandbox */}
        <script dangerouslySetInnerHTML={{ __html: historyPolyfill }} />
        {/*
          Office.js is loaded dynamically in Providers to support dev mode.
          In dev mode (?dev=true), Office.js is not loaded to preserve
          the browser's native history API that Next.js needs.
        */}
      </head>
      <body className="bg-background text-foreground antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
