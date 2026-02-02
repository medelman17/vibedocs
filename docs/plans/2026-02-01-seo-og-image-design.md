# SEO & OG Image Design

**Date:** 2026-02-01
**Status:** Approved

---

## Overview

SEO, metadata, and social sharing implementation for VibeDocs landing page.

**Goals:**
- Portfolio showcase (impressive when shared on LinkedIn/Twitter)
- Organic discovery (attract users searching for NDA analysis tools)

**Scope:** Landing page only with static branded OG image

---

## Branding

| Element | Value |
|---------|-------|
| Product name | VibeDocs |
| Domain | vdocs.edel.sh |
| Tagline | Upload. Understand. Decide. |
| Visual style | Bold/tech-forward (gradient, glassmorphism, modern sans-serif) |

---

## Implementation

### 1. Core Metadata (`app/layout.tsx`)

```typescript
export const metadata: Metadata = {
  metadataBase: new URL('https://vdocs.edel.sh'),
  title: {
    default: 'VibeDocs – Upload. Understand. Decide.',
    template: '%s | VibeDocs'
  },
  description: 'AI-powered NDA analysis grounded in 13,000+ annotated legal clauses. Extract risks, compare contracts, generate NDAs from battle-tested templates.',
  keywords: ['NDA analysis', 'contract review', 'AI legal', 'clause extraction', 'CUAD'],
  authors: [{ name: 'Mike Edelman', url: 'https://www.linkedin.com/in/michaeljedelman/' }],
  creator: 'Mike Edelman',
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://vdocs.edel.sh',
    siteName: 'VibeDocs',
    title: 'VibeDocs – Upload. Understand. Decide.',
    description: 'AI-powered NDA analysis grounded in 13,000+ annotated legal clauses.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'VibeDocs – Upload. Understand. Decide.',
    description: 'AI-powered NDA analysis grounded in 13,000+ annotated legal clauses.',
  },
  robots: {
    index: true,
    follow: true,
  },
}
```

### 2. OG Image (`app/opengraph-image.tsx`)

Uses `@vercel/og` (Next.js built-in ImageResponse) for code-based generation.

**Visual design:**
- 1200×630px
- Gradient background: deep purple (#1e1b4b) → electric blue (#0ea5e9)
- Glassmorphic card with "VibeDocs" title and tagline
- Stylized risk bars hinting at analysis UI
- Domain in bottom corner

```typescript
import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'VibeDocs – Upload. Understand. Decide.'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function Image() {
  return new ImageResponse(
    (
      <div style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #1e1b4b 0%, #0ea5e9 100%)',
        fontFamily: 'Geist, system-ui, sans-serif',
      }}>
        {/* Glassmorphic card */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          padding: '48px 64px',
          background: 'rgba(255, 255, 255, 0.1)',
          borderRadius: '24px',
          border: '1px solid rgba(255, 255, 255, 0.2)',
          backdropFilter: 'blur(10px)',
        }}>
          <span style={{ fontSize: 72, fontWeight: 700, color: 'white' }}>
            VibeDocs
          </span>
          <span style={{ fontSize: 32, color: 'rgba(255,255,255,0.8)', marginTop: 16 }}>
            Upload. Understand. Decide.
          </span>

          {/* Stylized risk bars */}
          <div style={{ display: 'flex', gap: 12, marginTop: 40 }}>
            <div style={{ width: 180, height: 8, background: 'rgba(255,255,255,0.3)', borderRadius: 4 }}>
              <div style={{ width: '78%', height: '100%', background: '#22c55e', borderRadius: 4 }} />
            </div>
            <div style={{ width: 180, height: 8, background: 'rgba(255,255,255,0.3)', borderRadius: 4 }}>
              <div style={{ width: '32%', height: '100%', background: '#f97316', borderRadius: 4 }} />
            </div>
          </div>
        </div>

        {/* Domain */}
        <span style={{ position: 'absolute', bottom: 40, fontSize: 24, color: 'rgba(255,255,255,0.6)' }}>
          vdocs.edel.sh
        </span>
      </div>
    ),
    { ...size }
  )
}
```

### 3. robots.txt (`app/robots.ts`)

```typescript
import { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/api/', '/dashboard/'],
    },
    sitemap: 'https://vdocs.edel.sh/sitemap.xml',
  }
}
```

### 4. sitemap.xml (`app/sitemap.ts`)

```typescript
import { MetadataRoute } from 'next'

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: 'https://vdocs.edel.sh',
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 1,
    },
  ]
}
```

---

## Files to Create/Modify

| File | Action |
|------|--------|
| `app/layout.tsx` | Update metadata export |
| `app/opengraph-image.tsx` | Create (new) |
| `app/robots.ts` | Create (new) |
| `app/sitemap.ts` | Create (new) |

---

## Competitive Positioning

Differentiated from SimpleDocs ($249/mo enterprise tool):
- Open source / transparent methodology
- Free
- NDA-specific (deep focus vs generic contracts)
- Evidence-grounded (cites CUAD dataset)

Tagline "Upload. Understand. Decide." is minimal and confident vs typical SaaS marketing speak.
