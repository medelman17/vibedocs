"use client"

import { useState, useRef, useEffect } from "react"
import { Cormorant_Garamond } from "next/font/google"
import { GeistSans } from "geist/font/sans"
import { cn } from "@/lib/utils"
import { joinWaitlist } from "./actions/waitlist"

const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  variable: "--font-display",
})

export default function Home() {
  const [email, setEmail] = useState("")
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isHovering, setIsHovering] = useState(false)
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 })
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect()
        setMousePosition({
          x: (e.clientX - rect.left) / rect.width,
          y: (e.clientY - rect.top) / rect.height,
        })
      }
    }

    window.addEventListener("mousemove", handleMouseMove)
    return () => window.removeEventListener("mousemove", handleMouseMove)
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || isSubmitting) return

    setIsSubmitting(true)
    setError(null)

    const result = await joinWaitlist(email)

    if (result.success) {
      setIsSubmitted(true)
    } else {
      setError(result.error)
    }

    setIsSubmitting(false)
  }

  return (
    <div
      ref={containerRef}
      className={cn(
        cormorant.variable,
        GeistSans.variable,
        "relative min-h-screen overflow-hidden"
      )}
      style={{
        background: `
          radial-gradient(
            ellipse 80% 50% at ${50 + mousePosition.x * 10}% ${40 + mousePosition.y * 10}%,
            oklch(0.95 0.025 293) 0%,
            oklch(0.97 0.015 290) 40%,
            oklch(0.99 0.005 285) 100%
          )
        `,
      }}
    >
      {/* Animated grain overlay */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.015]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
        }}
      />

      {/* Floating orbs */}
      <div
        className="absolute top-1/4 left-1/4 h-[500px] w-[500px] rounded-full opacity-40 blur-3xl transition-transform duration-[3000ms] ease-out"
        style={{
          background: "oklch(0.75 0.12 293)",
          transform: `translate(${mousePosition.x * 30}px, ${mousePosition.y * 30}px)`,
        }}
      />
      <div
        className="absolute bottom-1/4 right-1/4 h-[400px] w-[400px] rounded-full opacity-30 blur-3xl transition-transform duration-[4000ms] ease-out"
        style={{
          background: "oklch(0.80 0.10 175)",
          transform: `translate(${-mousePosition.x * 40}px, ${-mousePosition.y * 40}px)`,
        }}
      />
      <div
        className="absolute top-1/2 right-1/3 h-[300px] w-[300px] rounded-full opacity-25 blur-3xl transition-transform duration-[5000ms] ease-out"
        style={{
          background: "oklch(0.70 0.14 280)",
          transform: `translate(${mousePosition.x * 20}px, ${-mousePosition.y * 20}px)`,
        }}
      />

      {/* Main content */}
      <div className="relative z-10 flex min-h-screen flex-col items-center justify-center px-6 py-12">
        {/* Logo / Brand mark */}
        <div
          className="mb-16 opacity-0 animate-[fadeSlideUp_1s_ease-out_0.2s_forwards]"
        >
          <div className="flex items-center gap-3">
            <div className="relative h-10 w-10">
              <div
                className="absolute inset-0 rounded-lg"
                style={{
                  background: "linear-gradient(135deg, oklch(0.50 0.24 293) 0%, oklch(0.40 0.20 293) 100%)",
                }}
              />
              <div className="absolute inset-[3px] rounded-md bg-gradient-to-br from-white/90 to-white/70" />
              <div
                className="absolute inset-[6px] rounded"
                style={{
                  background: "linear-gradient(135deg, oklch(0.60 0.20 293) 0%, oklch(0.50 0.18 293) 100%)",
                }}
              />
            </div>
            <span
              className="text-xl tracking-wide uppercase"
              style={{
                fontFamily: "var(--font-geist-sans)",
                color: "oklch(0.35 0.02 280)",
                fontWeight: 500,
              }}
            >
              VibeDocs
            </span>
          </div>
        </div>

        {/* Main headline */}
        <div className="max-w-4xl text-center">
          <h1
            className="mb-6 text-5xl leading-[1.1] tracking-[-0.02em] opacity-0 animate-[fadeSlideUp_1s_ease-out_0.4s_forwards] sm:text-6xl md:text-7xl lg:text-8xl"
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 300,
              color: "oklch(0.20 0.02 280)",
            }}
          >
            Something{" "}
            <span
              className="italic"
              style={{
                fontWeight: 400,
                background: "linear-gradient(135deg, oklch(0.55 0.24 293) 0%, oklch(0.65 0.16 175) 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              extraordinary
            </span>
            <br />
            is brewing
          </h1>

          <p
            className="mx-auto mb-12 max-w-xl text-lg leading-relaxed opacity-0 animate-[fadeSlideUp_1s_ease-out_0.6s_forwards] sm:text-xl"
            style={{
              fontFamily: "var(--font-geist-sans)",
              color: "oklch(0.40 0.01 280)",
              fontWeight: 400,
            }}
          >
            AI-powered NDA analysis that understands risk the way you do.
            Be the first to experience intelligent contract review.
          </p>

          {/* Email form */}
          <div className="opacity-0 animate-[fadeSlideUp_1s_ease-out_0.8s_forwards]">
            {!isSubmitted ? (
              <form onSubmit={handleSubmit} className="mx-auto max-w-md">
                <div
                  className="group relative overflow-hidden rounded-full p-[1px] transition-all duration-500"
                  style={{
                    background: isHovering
                      ? "linear-gradient(135deg, oklch(0.55 0.24 293) 0%, oklch(0.60 0.16 175) 100%)"
                      : "oklch(0.90 0.02 293)",
                  }}
                >
                  <div className="relative flex items-center rounded-full bg-white/90 backdrop-blur-sm">
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="Enter your email"
                      required
                      className="flex-1 bg-transparent px-6 py-4 text-base outline-none placeholder:text-[oklch(0.60_0.01_280)]"
                      style={{
                        fontFamily: "var(--font-geist-sans)",
                        color: "oklch(0.20 0.02 280)",
                      }}
                      onFocus={() => setIsHovering(true)}
                      onBlur={() => setIsHovering(false)}
                    />
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="m-1.5 rounded-full px-6 py-2.5 text-sm font-medium text-white transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed disabled:hover:scale-100"
                      style={{
                        fontFamily: "var(--font-geist-sans)",
                        background: "linear-gradient(135deg, oklch(0.50 0.24 293) 0%, oklch(0.55 0.18 200) 100%)",
                        boxShadow: "0 2px 12px oklch(0.45 0.20 293 / 0.3)",
                      }}
                      onMouseEnter={() => setIsHovering(true)}
                      onMouseLeave={() => setIsHovering(false)}
                    >
                      {isSubmitting ? "Joining..." : "Join Waitlist"}
                    </button>
                  </div>
                </div>

                {error ? (
                  <p
                    className="mt-4 text-sm"
                    style={{
                      fontFamily: "var(--font-geist-sans)",
                      color: "oklch(0.55 0.20 25)",
                    }}
                  >
                    {error}
                  </p>
                ) : (
                  <p
                    className="mt-4 text-sm"
                    style={{
                      fontFamily: "var(--font-geist-sans)",
                      color: "oklch(0.55 0.01 280)",
                    }}
                  >
                    No spam, ever. Unsubscribe anytime.
                  </p>
                )}
              </form>
            ) : (
              <div
                className="mx-auto max-w-md rounded-2xl p-8 animate-[scaleIn_0.5s_ease-out_forwards]"
                style={{
                  background: "linear-gradient(135deg, oklch(0.96 0.03 70) 0%, oklch(0.98 0.02 60) 100%)",
                  border: "1px solid oklch(0.90 0.04 65)",
                }}
              >
                <div
                  className="mb-4 mx-auto flex h-16 w-16 items-center justify-center rounded-full"
                  style={{
                    background: "linear-gradient(135deg, oklch(0.50 0.15 55) 0%, oklch(0.40 0.12 70) 100%)",
                  }}
                >
                  <svg
                    className="h-8 w-8 text-white"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                </div>
                <h3
                  className="mb-2 text-2xl"
                  style={{
                    fontFamily: "var(--font-display)",
                    fontWeight: 500,
                    color: "oklch(0.25 0.03 50)",
                  }}
                >
                  You&apos;re on the list
                </h3>
                <p
                  className="text-base"
                  style={{
                    fontFamily: "var(--font-body)",
                    color: "oklch(0.45 0.02 50)",
                  }}
                >
                  We&apos;ll let you know when we launch.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div
          className="absolute bottom-8 left-1/2 -translate-x-1/2 opacity-0 animate-[fadeIn_1s_ease-out_1.2s_forwards]"
        >
          <p
            className="text-sm"
            style={{
              fontFamily: "var(--font-body)",
              color: "oklch(0.55 0.02 50)",
            }}
          >
            2025 VibeDocs. Crafted with care.
          </p>
        </div>
      </div>

      {/* Keyframes */}
      <style jsx global>{`
        @keyframes fadeSlideUp {
          from {
            opacity: 0;
            transform: translateY(30px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }

        @keyframes scaleIn {
          from {
            opacity: 0;
            transform: scale(0.9);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
      `}</style>
    </div>
  )
}
