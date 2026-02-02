# Landing Page Rebrand Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Update the landing page colors and typography to match the VibeDocs violet/teal brand while preserving all existing animations and interactions.

**Architecture:** Single-file update to `app/page.tsx`. Replace all amber/gold oklch color values with violet/teal equivalents. Swap Outfit font for Geist Sans while keeping Cormorant Garamond for headlines.

**Tech Stack:** Next.js, React, Geist font, oklch colors, CSS-in-JS inline styles

**Design Document:** `docs/plans/2026-02-02-landing-page-rebrand-design.md`

---

## Task 1: Update Font Imports

**Files:**
- Modify: `app/page.tsx:1-18`

**Step 1: Update imports**

Replace the font imports at the top of the file:

```tsx
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
```

**Step 2: Update className on root container**

Find the root div (around line 62-68) and update the className:

```tsx
<div
  ref={containerRef}
  className={cn(
    cormorant.variable,
    GeistSans.variable,
    "relative min-h-screen overflow-hidden"
  )}
```

**Step 3: Verify build**

Run: `pnpm build`
Expected: Build succeeds with no errors

**Step 4: Commit**

```bash
git add app/page.tsx
git commit -m "refactor: switch body font from Outfit to Geist Sans"
```

---

## Task 2: Update Background Gradient

**Files:**
- Modify: `app/page.tsx:69-78`

**Step 1: Update the background gradient colors**

Find the style prop on the root container and replace:

```tsx
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
```

**Step 2: Visual verification**

Run: `pnpm dev`
Open: http://localhost:3000
Expected: Background should have a very subtle cool lavender tint instead of warm cream

**Step 3: Commit**

```bash
git add app/page.tsx
git commit -m "style: update background gradient to lavender tint"
```

---

## Task 3: Update Floating Orbs

**Files:**
- Modify: `app/page.tsx:88-109`

**Step 1: Update all three orb colors**

Replace the three orb divs with violet/teal colors:

```tsx
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
```

**Step 2: Visual verification**

Run: `pnpm dev`
Expected: Orbs should be violet and teal, moving with mouse

**Step 3: Commit**

```bash
git add app/page.tsx
git commit -m "style: update floating orbs to violet/teal"
```

---

## Task 4: Update Logo Block

**Files:**
- Modify: `app/page.tsx:114-144`

**Step 1: Update logo icon gradients and text styling**

Replace the entire logo block:

```tsx
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
```

**Step 2: Visual verification**

Expected: Logo icon should be violet gradient, text should use Geist Sans

**Step 3: Commit**

```bash
git add app/page.tsx
git commit -m "style: update logo to violet gradient and Geist font"
```

---

## Task 5: Update Headline and Tagline

**Files:**
- Modify: `app/page.tsx:146-183`

**Step 1: Update headline text colors and "extraordinary" gradient**

```tsx
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
```

**Step 2: Visual verification**

Expected: "extraordinary" should have violet→teal gradient, tagline should use Geist Sans

**Step 3: Commit**

```bash
git add app/page.tsx
git commit -m "style: update headline and tagline colors"
```

---

## Task 6: Update Email Form

**Files:**
- Modify: `app/page.tsx:185-250`

**Step 1: Update input focus ring and button styles**

Replace the form section:

```tsx
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
            className="flex-1 bg-transparent px-6 py-4 text-base outline-none"
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
```

**Step 2: Visual verification**

Expected: Button should be violet→teal gradient, input ring should glow violet on focus

**Step 3: Commit**

```bash
git add app/page.tsx
git commit -m "style: update email form to violet/teal theme"
```

---

## Task 7: Update Success State

**Files:**
- Modify: `app/page.tsx:251-299`

**Step 1: Update success container and checkmark**

Replace the success state section:

```tsx
) : (
  <div
    className="mx-auto max-w-md rounded-2xl p-8 animate-[scaleIn_0.5s_ease-out_forwards]"
    style={{
      background: "linear-gradient(135deg, oklch(0.97 0.02 175) 0%, oklch(0.99 0.01 200) 100%)",
      border: "1px solid oklch(0.92 0.04 175)",
    }}
  >
    <div
      className="mb-4 mx-auto flex h-16 w-16 items-center justify-center rounded-full"
      style={{
        background: "linear-gradient(135deg, oklch(0.60 0.14 175) 0%, oklch(0.55 0.12 185) 100%)",
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
        color: "oklch(0.20 0.02 280)",
      }}
    >
      You&apos;re on the list
    </h3>
    <p
      className="text-base"
      style={{
        fontFamily: "var(--font-geist-sans)",
        color: "oklch(0.40 0.01 280)",
      }}
    >
      We&apos;ll let you know when we launch.
    </p>
  </div>
)}
```

**Step 2: Visual verification**

Submit a test email to see success state
Expected: Container has teal tint, checkmark is teal gradient

**Step 3: Commit**

```bash
git add app/page.tsx
git commit -m "style: update success state to teal theme"
```

---

## Task 8: Update Footer

**Files:**
- Modify: `app/page.tsx:303-316`

**Step 1: Update footer text color and font**

```tsx
{/* Footer */}
<div
  className="absolute bottom-8 left-1/2 -translate-x-1/2 opacity-0 animate-[fadeIn_1s_ease-out_1.2s_forwards]"
>
  <p
    className="text-sm"
    style={{
      fontFamily: "var(--font-geist-sans)",
      color: "oklch(0.55 0.01 280)",
    }}
  >
    2026 VibeDocs. Crafted with care.
  </p>
</div>
```

**Step 2: Visual verification**

Expected: Footer uses Geist Sans, cool gray color

**Step 3: Commit**

```bash
git add app/page.tsx
git commit -m "style: update footer typography"
```

---

## Task 9: Update Placeholder Color

**Files:**
- Modify: `app/page.tsx` (input placeholder)

**Step 1: Add placeholder color class**

The input placeholder needs a CSS class since inline styles don't work for placeholders. Add to the input className:

```tsx
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
```

**Step 2: Visual verification**

Expected: Placeholder text should be cool gray

**Step 3: Commit**

```bash
git add app/page.tsx
git commit -m "style: update input placeholder color"
```

---

## Task 10: Final Verification and Cleanup

**Step 1: Run linter**

Run: `pnpm lint`
Expected: No errors

**Step 2: Run build**

Run: `pnpm build`
Expected: Build succeeds

**Step 3: Visual QA checklist**

Open http://localhost:3000 and verify:
- [ ] Background has subtle lavender tint
- [ ] Orbs are violet and teal, move with mouse
- [ ] Logo icon is violet gradient
- [ ] "VibeDocs" text is Geist Sans
- [ ] "extraordinary" has violet→teal gradient
- [ ] Tagline is Geist Sans, cool gray
- [ ] Button is violet→teal gradient
- [ ] Input focus ring glows violet
- [ ] Success state has teal theme
- [ ] Footer is Geist Sans, cool gray

**Step 4: Remove unused Outfit import**

Ensure the Outfit font import is completely removed from the file.

**Step 5: Final commit**

```bash
git add -A
git commit -m "chore: final cleanup and verification"
```

---

## Summary

| Task | Description | Commits |
|------|-------------|---------|
| 1 | Font imports | 1 |
| 2 | Background gradient | 1 |
| 3 | Floating orbs | 1 |
| 4 | Logo block | 1 |
| 5 | Headline/tagline | 1 |
| 6 | Email form | 1 |
| 7 | Success state | 1 |
| 8 | Footer | 1 |
| 9 | Placeholder color | 1 |
| 10 | Final verification | 1 |

**Total:** 10 tasks, ~10 commits
