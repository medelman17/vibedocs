import type { Metadata } from "next"
import Script from "next/script"
import "@/app/globals.css"
import { Providers } from "./providers"

export const metadata: Metadata = {
  title: "NDA Analyst - Word Add-in",
  description: "Analyze NDAs directly in Microsoft Word",
}

export default function WordAddInLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <head>
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
