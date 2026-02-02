import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'VibeDocs – Upload. Understand. Decide.'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function Image() {
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
          background: 'linear-gradient(135deg, #1e1b4b 0%, #0ea5e9 100%)',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            padding: '48px 64px',
            background: 'rgba(255, 255, 255, 0.1)',
            borderRadius: '24px',
            border: '1px solid rgba(255, 255, 255, 0.2)',
          }}
        >
          <span style={{ fontSize: 72, fontWeight: 700, color: 'white' }}>
            VibeDocs
          </span>
          <span
            style={{
              fontSize: 32,
              color: 'rgba(255,255,255,0.8)',
              marginTop: 16,
            }}
          >
            Upload. Understand. Decide.
          </span>

          <div style={{ display: 'flex', gap: 12, marginTop: 40 }}>
            <div
              style={{
                width: 180,
                height: 8,
                background: 'rgba(255,255,255,0.3)',
                borderRadius: 4,
                display: 'flex',
              }}
            >
              <div
                style={{
                  width: '78%',
                  height: '100%',
                  background: '#22c55e',
                  borderRadius: 4,
                }}
              />
            </div>
            <div
              style={{
                width: 180,
                height: 8,
                background: 'rgba(255,255,255,0.3)',
                borderRadius: 4,
                display: 'flex',
              }}
            >
              <div
                style={{
                  width: '32%',
                  height: '100%',
                  background: '#f97316',
                  borderRadius: 4,
                }}
              />
            </div>
          </div>
        </div>

        <span
          style={{
            position: 'absolute',
            bottom: 40,
            fontSize: 24,
            color: 'rgba(255,255,255,0.6)',
          }}
        >
          vdocs.edel.sh
        </span>
      </div>
    ),
    { ...size }
  )
}
