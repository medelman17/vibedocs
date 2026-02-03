"use client"

import { useMemo } from "react"
import { type RiskLevel } from "@/types/word-addin"
import { useAnalysisStore } from "../store/analysis"

/**
 * Risk gauge configuration with colors and labels
 */
const RISK_CONFIG: Record<
  RiskLevel,
  { label: string; color: string; glowColor: string }
> = {
  standard: {
    label: "Standard Risk",
    color: "oklch(0.65 0.2 145)",
    glowColor: "oklch(0.65 0.2 145 / 0.3)",
  },
  cautious: {
    label: "Moderate Risk",
    color: "oklch(0.8 0.18 85)",
    glowColor: "oklch(0.8 0.18 85 / 0.3)",
  },
  aggressive: {
    label: "High Risk",
    color: "oklch(0.63 0.24 25)",
    glowColor: "oklch(0.63 0.24 25 / 0.3)",
  },
  unknown: {
    label: "Unknown",
    color: "oklch(0.55 0 0)",
    glowColor: "oklch(0.55 0 0 / 0.2)",
  },
}

/**
 * Derive risk level from score if not provided
 */
function deriveRiskLevel(score: number | null, level: string | null): RiskLevel {
  if (level && level in RISK_CONFIG) {
    return level as RiskLevel
  }
  if (score !== null) {
    if (score <= 33) return "standard"
    if (score <= 66) return "cautious"
    return "aggressive"
  }
  return "unknown"
}

/**
 * RiskGauge - A dramatic, animated semi-circular gauge for risk visualization.
 *
 * Features:
 * - Smooth spring animations on value changes
 * - Gradient fill with glow effects
 * - Needle indicator with drop shadow
 * - Color-coded risk levels
 */
export function RiskGauge() {
  const results = useAnalysisStore((state) => state.results)

  // Memoize calculations
  const gaugeData = useMemo(() => {
    if (!results) return null

    const { overallRiskScore, overallRiskLevel } = results
    const riskLevel = deriveRiskLevel(overallRiskScore, overallRiskLevel)
    const config = RISK_CONFIG[riskLevel]
    const score = overallRiskScore ?? 0

    // SVG dimensions
    const size = 160
    const strokeWidth = 14
    const radius = (size - strokeWidth) / 2
    const center = size / 2

    // Semi-circle arc calculation
    const circumference = Math.PI * radius
    const progress = (score / 100) * circumference
    const dashOffset = circumference - progress

    // Needle rotation (0 = left, 180 = right)
    const needleRotation = -90 + (score / 100) * 180

    return {
      score,
      riskLevel,
      config,
      size,
      strokeWidth,
      radius,
      center,
      circumference,
      dashOffset,
      needleRotation,
    }
  }, [results])

  if (!gaugeData) {
    return null
  }

  const {
    score,
    riskLevel,
    config,
    size,
    strokeWidth,
    radius,
    center,
    circumference,
    dashOffset,
    needleRotation,
  } = gaugeData

  return (
    <div className={`addin-card addin-risk-gauge risk-${riskLevel} animate-scale-in`}>
      <h3 className="addin-risk-gauge-title">Risk Assessment</h3>

      {/* Gauge SVG */}
      <div className="addin-gauge-container">
        <svg
          width={size}
          height={size / 2 + 12}
          viewBox={`0 0 ${size} ${size / 2 + 12}`}
          className="addin-gauge-svg"
        >
          {/* Gradient definition */}
          <defs>
            <linearGradient id={`gauge-gradient-${riskLevel}`} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor={config.color} stopOpacity={0.6} />
              <stop offset="50%" stopColor={config.color} stopOpacity={1} />
              <stop offset="100%" stopColor={config.color} stopOpacity={0.8} />
            </linearGradient>
            <filter id="gauge-glow">
              <feGaussianBlur stdDeviation="3" result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <filter id="needle-shadow">
              <feDropShadow dx="0" dy="2" stdDeviation="2" floodOpacity="0.3" />
            </filter>
          </defs>

          {/* Background arc */}
          <path
            d={`M ${strokeWidth / 2} ${center} A ${radius} ${radius} 0 0 1 ${size - strokeWidth / 2} ${center}`}
            className="addin-gauge-bg"
          />

          {/* Progress arc with gradient and glow */}
          <path
            d={`M ${strokeWidth / 2} ${center} A ${radius} ${radius} 0 0 1 ${size - strokeWidth / 2} ${center}`}
            className="addin-gauge-fill"
            stroke={`url(#gauge-gradient-${riskLevel})`}
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            filter="url(#gauge-glow)"
            style={{
              transition: "stroke-dashoffset 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)",
            }}
          />

          {/* Tick marks */}
          {[0, 25, 50, 75, 100].map((tick) => {
            const angle = (-90 + (tick / 100) * 180) * (Math.PI / 180)
            const innerR = radius - strokeWidth / 2 - 4
            const outerR = radius - strokeWidth / 2 - 10
            const x1 = center + innerR * Math.cos(angle)
            const y1 = center + innerR * Math.sin(angle)
            const x2 = center + outerR * Math.cos(angle)
            const y2 = center + outerR * Math.sin(angle)
            return (
              <line
                key={tick}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke="currentColor"
                strokeWidth={tick % 50 === 0 ? 2 : 1}
                strokeLinecap="round"
                className="text-neutral-300 dark:text-neutral-600"
              />
            )
          })}

          {/* Needle */}
          <g
            className="addin-gauge-needle"
            style={{
              transform: `rotate(${needleRotation}deg)`,
              transformOrigin: `${center}px ${center}px`,
              transition: "transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)",
            }}
            filter="url(#needle-shadow)"
          >
            <line
              x1={center}
              y1={center}
              x2={center}
              y2={strokeWidth + 18}
              stroke={config.color}
              strokeWidth={3}
              strokeLinecap="round"
              className="addin-gauge-needle-line"
            />
            <circle
              cx={center}
              cy={center}
              r={7}
              fill={config.color}
              className="addin-gauge-needle-dot"
            />
            <circle
              cx={center}
              cy={center}
              r={3}
              fill="white"
            />
          </g>
        </svg>

        {/* Score display */}
        <div className="addin-gauge-score">
          <span
            className="addin-gauge-score-value"
            style={{ color: config.color }}
          >
            {score}
          </span>
          <span className="addin-gauge-score-max">/100</span>
        </div>
      </div>

      {/* Risk level label */}
      <p
        className="addin-gauge-label"
        style={{ color: config.color }}
      >
        {config.label}
      </p>

      {/* Scale labels */}
      <div className="addin-gauge-scale">
        <span>Low Risk</span>
        <span>High Risk</span>
      </div>
    </div>
  )
}
