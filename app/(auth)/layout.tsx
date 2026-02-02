import { FileText } from "lucide-react"
import Link from "next/link"

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      {/* Left Panel - Branding */}
      <div className="relative hidden lg:flex flex-col bg-slate-950 text-white overflow-hidden">
        {/* Animated gradient background */}
        <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950" />

        {/* Decorative grid pattern */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
          }}
        />

        {/* Floating orbs */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-slate-500/10 rounded-full blur-3xl animate-pulse delay-1000" />

        {/* Content */}
        <div className="relative z-10 flex flex-col h-full p-10">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-3 group">
            <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-amber-500/10 border border-amber-500/20 group-hover:border-amber-500/40 transition-colors">
              <FileText className="w-5 h-5 text-amber-400" />
            </div>
            <span className="text-xl font-semibold tracking-tight">VibeDocs</span>
          </Link>

          {/* Main content */}
          <div className="flex-1 flex items-center justify-center">
            <div className="max-w-md space-y-8">
              <div className="space-y-4">
                <h1 className="text-4xl font-serif font-light tracking-tight leading-tight">
                  Analyze contracts with
                  <span className="block text-amber-400 font-normal">precision & clarity</span>
                </h1>
                <p className="text-lg text-slate-400 leading-relaxed">
                  AI-powered NDA analysis that identifies risks, extracts key clauses, and ensures your agreements protect what matters most.
                </p>
              </div>

              {/* Feature list */}
              <div className="grid gap-4">
                {[
                  "41-category CUAD taxonomy extraction",
                  "Risk scoring with cited evidence",
                  "Side-by-side document comparison",
                ].map((feature, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 text-slate-300"
                  >
                    <div className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-amber-500" />
                    <span className="text-sm">{feature}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Footer quote */}
          <div className="space-y-3">
            <blockquote className="text-slate-400 italic">
              &ldquo;The best NDA analysis tool we&apos;ve used. It caught issues our legal team missed.&rdquo;
            </blockquote>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-400 to-amber-600" />
              <div>
                <p className="text-sm font-medium">Sarah Chen</p>
                <p className="text-xs text-slate-500">General Counsel, TechCorp</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Right Panel - Auth Form */}
      <div className="flex flex-col min-h-screen bg-background">
        {/* Mobile logo */}
        <div className="lg:hidden p-6">
          <Link href="/" className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10 border border-primary/20">
              <FileText className="w-5 h-5 text-primary" />
            </div>
            <span className="text-xl font-semibold tracking-tight">VibeDocs</span>
          </Link>
        </div>

        {/* Form container */}
        <div className="flex-1 flex items-center justify-center p-6 lg:p-10">
          <div className="w-full max-w-[400px]">
            {children}
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 text-center text-sm text-muted-foreground">
          <p>
            By continuing, you agree to our{" "}
            <Link href="/terms" className="underline underline-offset-4 hover:text-foreground transition-colors">
              Terms of Service
            </Link>
            {" "}and{" "}
            <Link href="/privacy" className="underline underline-offset-4 hover:text-foreground transition-colors">
              Privacy Policy
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
