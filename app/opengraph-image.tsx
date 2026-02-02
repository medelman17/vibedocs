import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'VibeDocs – AI-Powered NDA Analysis'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function Image() {
  // Load fonts with fallback handling
  let cormorantFont: ArrayBuffer | null = null
  let interFont: ArrayBuffer | null = null

  try {
    const [cormorantRes, interRes] = await Promise.all([
      fetch(
        'https://fonts.gstatic.com/s/cormorantgaramond/v16/co3YmX5slCNuHLi8bLeY9MK7whWMhyjYrEtFnS8r.woff2'
      ),
      fetch(
        'https://fonts.gstatic.com/s/inter/v13/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyfAZ9hjp-Ek-_EeA.woff2'
      ),
    ])

    if (cormorantRes.ok && interRes.ok) {
      cormorantFont = await cormorantRes.arrayBuffer()
      interFont = await interRes.arrayBuffer()
    }
  } catch {
    // Fonts will be null, we'll use system fonts as fallback
  }

  const fonts = []
  if (cormorantFont) {
    fonts.push({
      name: 'Cormorant Garamond',
      data: cormorantFont,
      style: 'normal' as const,
      weight: 400 as const,
    })
  }
  if (interFont) {
    fonts.push({
      name: 'Inter',
      data: interFont,
      style: 'normal' as const,
      weight: 500 as const,
    })
  }

  const displayFont = cormorantFont ? 'Cormorant Garamond' : 'Georgia, serif'
  const bodyFont = interFont ? 'Inter' : 'system-ui, sans-serif'

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          background: 'linear-gradient(145deg, #EDE6DA 0%, #F5F0E8 40%, #FAF8F4 100%)',
        }}
      >
        {/* Floating orbs - matching landing page aesthetic */}
        <div
          style={{
            position: 'absolute',
            top: 80,
            left: 120,
            width: 400,
            height: 400,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(180, 170, 150, 0.35) 0%, rgba(180, 170, 150, 0) 70%)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            bottom: 60,
            right: 100,
            width: 350,
            height: 350,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(170, 165, 145, 0.3) 0%, rgba(170, 165, 145, 0) 70%)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            top: 200,
            right: 280,
            width: 280,
            height: 280,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(160, 155, 135, 0.25) 0%, rgba(160, 155, 135, 0) 70%)',
          }}
        />

        {/* Main content container */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {/* Logo mark - matching landing page */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              marginBottom: 48,
            }}
          >
            {/* Logo icon */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                position: 'relative',
                width: 56,
                height: 56,
                marginRight: 16,
              }}
            >
              {/* Outer gradient */}
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  borderRadius: 12,
                  background: 'linear-gradient(135deg, #7A6B5A 0%, #5C4D3E 100%)',
                }}
              />
              {/* Inner white */}
              <div
                style={{
                  position: 'absolute',
                  top: 4,
                  left: 4,
                  right: 4,
                  bottom: 4,
                  borderRadius: 9,
                  background: 'linear-gradient(135deg, #FFFFFF 0%, #F5F5F5 100%)',
                }}
              />
              {/* Inner accent */}
              <div
                style={{
                  position: 'absolute',
                  top: 8,
                  left: 8,
                  right: 8,
                  bottom: 8,
                  borderRadius: 6,
                  background: 'linear-gradient(135deg, #8A7B68 0%, #6B5C4A 100%)',
                }}
              />
            </div>
            {/* Brand name - manually uppercased since textTransform not supported */}
            <span
              style={{
                fontSize: 28,
                fontFamily: bodyFont,
                fontWeight: 500,
                letterSpacing: '0.2em',
                color: '#5C564E',
              }}
            >
              VIBEDOCS
            </span>
          </div>

          {/* Main headline - elegant serif */}
          <div
            style={{
              fontSize: 72,
              fontFamily: displayFont,
              fontWeight: 400,
              color: '#3D3935',
              letterSpacing: '-0.02em',
              lineHeight: 1.1,
              textAlign: 'center',
              marginBottom: 24,
            }}
          >
            Intelligent Contract Review
          </div>

          {/* Tagline */}
          <div
            style={{
              fontSize: 26,
              fontFamily: bodyFont,
              fontWeight: 400,
              color: '#7A756D',
              textAlign: 'center',
              maxWidth: 700,
              lineHeight: 1.5,
            }}
          >
            AI-powered NDA analysis that understands risk the way you do.
          </div>
        </div>

        {/* Domain footer */}
        <span
          style={{
            position: 'absolute',
            bottom: 36,
            fontSize: 18,
            fontFamily: bodyFont,
            fontWeight: 400,
            color: '#9A958D',
            letterSpacing: '0.05em',
          }}
        >
          vdocs.edel.sh
        </span>
      </div>
    ),
    {
      ...size,
      fonts: fonts.length > 0 ? fonts : undefined,
    }
  )
}
