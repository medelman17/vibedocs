import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'VibeDocs – AI-Powered NDA Analysis'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function Image() {
  // Load fonts - Cormorant Garamond for display, Inter for body
  // Note: Google Fonts URLs change over time. Get current URLs from:
  // https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400&display=swap
  // https://fonts.googleapis.com/css2?family=Inter:wght@500&display=swap
  const [cormorantFont, interFont] = await Promise.all([
    fetch(
      'https://fonts.gstatic.com/s/cormorantgaramond/v21/co3umX5slCNuHLi8bLeY9MK7whWMhyjypVO7abI26QOD_v86KnTOig.woff2'
    ).then((res) => res.arrayBuffer()),
    fetch(
      'https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuI6fAZ9hiA.woff2'
    ).then((res) => res.arrayBuffer()),
  ])

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
          overflow: 'hidden',
          // Warm cream gradient background matching landing page
          background: 'linear-gradient(145deg, #EDE6DA 0%, #F5F0E8 40%, #FAF8F4 100%)',
        }}
      >
        {/* Floating orbs - matching landing page aesthetic */}
        <div
          style={{
            position: 'absolute',
            top: '80px',
            left: '120px',
            width: '400px',
            height: '400px',
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(180, 170, 150, 0.35) 0%, transparent 70%)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            bottom: '60px',
            right: '100px',
            width: '350px',
            height: '350px',
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(170, 165, 145, 0.3) 0%, transparent 70%)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            top: '200px',
            right: '280px',
            width: '280px',
            height: '280px',
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(160, 155, 135, 0.25) 0%, transparent 70%)',
          }}
        />

        {/* Main content container */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
            zIndex: 10,
          }}
        >
          {/* Logo mark - matching landing page */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '16px',
              marginBottom: '48px',
            }}
          >
            {/* Logo icon */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                position: 'relative',
                width: '56px',
                height: '56px',
              }}
            >
              {/* Outer gradient */}
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  borderRadius: '12px',
                  background: 'linear-gradient(135deg, #7A6B5A 0%, #5C4D3E 100%)',
                }}
              />
              {/* Inner white */}
              <div
                style={{
                  position: 'absolute',
                  top: '4px',
                  left: '4px',
                  right: '4px',
                  bottom: '4px',
                  borderRadius: '9px',
                  background: 'linear-gradient(135deg, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.8) 100%)',
                }}
              />
              {/* Inner accent */}
              <div
                style={{
                  position: 'absolute',
                  top: '8px',
                  left: '8px',
                  right: '8px',
                  bottom: '8px',
                  borderRadius: '6px',
                  background: 'linear-gradient(135deg, #8A7B68 0%, #6B5C4A 100%)',
                }}
              />
            </div>
            {/* Brand name */}
            <span
              style={{
                fontSize: 28,
                fontFamily: 'Inter',
                fontWeight: 500,
                letterSpacing: '0.2em',
                textTransform: 'uppercase',
                color: '#5C564E',
              }}
            >
              VibeDocs
            </span>
          </div>

          {/* Main headline - elegant serif */}
          <h1
            style={{
              fontSize: 72,
              fontFamily: 'Cormorant Garamond',
              fontWeight: 400,
              color: '#3D3935',
              letterSpacing: '-0.02em',
              lineHeight: 1.1,
              textAlign: 'center',
              margin: 0,
              marginBottom: '24px',
            }}
          >
            Intelligent Contract Review
          </h1>

          {/* Tagline */}
          <p
            style={{
              fontSize: 26,
              fontFamily: 'Inter',
              fontWeight: 400,
              color: '#7A756D',
              textAlign: 'center',
              margin: 0,
              maxWidth: '700px',
              lineHeight: 1.5,
            }}
          >
            AI-powered NDA analysis that understands risk the way you do.
          </p>
        </div>

        {/* Domain footer */}
        <span
          style={{
            position: 'absolute',
            bottom: '36px',
            fontSize: 18,
            fontFamily: 'Inter',
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
      fonts: [
        {
          name: 'Cormorant Garamond',
          data: cormorantFont,
          style: 'normal',
          weight: 400,
        },
        {
          name: 'Inter',
          data: interFont,
          style: 'normal',
          weight: 500,
        },
      ],
    }
  )
}
