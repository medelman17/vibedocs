"use client"

import { useAnalysisStore } from "../store"

/**
 * Risk level type from PRD
 */
type RiskLevel = "standard" | "cautious" | "aggressive" | "unknown"

/**
 * Configuration for each risk level
 */
const riskLevelConfig: Record<
  RiskLevel,
  { label: string; colorClass: string; strokeColor: string }
> = {
  standard: {
    label: "Standard Risk",
    colorClass: "text-green-600 dark:text-green-400",
    strokeColor: "#16a34a", // green-600
  },
  cautious: {
    label: "Cautious Risk",
    colorClass: "text-yellow-600 dark:text-yellow-400",
    strokeColor: "#ca8a04", // yellow-600
  },
  aggressive: {
    label: "Aggressive Risk",
    colorClass: "text-red-600 dark:text-red-400",
    strokeColor: "#dc2626", // red-600
  },
  unknown: {
    label: "Unknown",
    colorClass: "text-muted-foreground",
    strokeColor: "#71717a", // zinc-500
  },
}

/**
 * Derive risk level from score if not provided
 */
function deriveRiskLevel(score: number | null, level: string | null): RiskLevel {
  // If we have a valid level, use it
  if (level && level in riskLevelConfig) {
    return level as RiskLevel
  }

  // If we have a score, derive level from it
  if (score !== null) {
    if (score <= 33) return "standard"
    if (score <= 66) return "cautious"
    return "aggressive"
  }

  return "unknown"
}

/**
 * Semi-circular gauge SVG component
 */
function GaugeSvg({
  score,
  strokeColor,
}: {
  score: number
  strokeColor: string
}) {
  // SVG dimensions
  const size = 180
  const strokeWidth = 12
  const radius = (size - strokeWidth) / 2
  const center = size / 2

  // Semi-circle arc (180 degrees, from left to right)
  // Start at left (9 o'clock), end at right (3 o'clock)
  const circumference = Math.PI * radius // Half circle
  const progress = (score / 100) * circumference

  return (
    <svg
      width={size}
      height={size / 2 + 10}
      viewBox={`0 0 ${size} ${size / 2 + 10}`}
      className="mx-auto"
    >
      {/* Background arc (gray) */}
      <path
        d={`M ${strokeWidth / 2} ${center} A ${radius} ${radius} 0 0 1 ${size - strokeWidth / 2} ${center}`}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        className="text-muted/30"
      />
      {/* Progress arc (colored) */}
      <path
        d={`M ${strokeWidth / 2} ${center} A ${radius} ${radius} 0 0 1 ${size - strokeWidth / 2} ${center}`}
        fill="none"
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={circumference - progress}
        className="transition-all duration-500 ease-out"
      />
      {/* Needle indicator */}
      <g
        transform={`rotate(${-90 + (score / 100) * 180}, ${center}, ${center})`}
        className="transition-transform duration-500 ease-out"
      >
        <line
          x1={center}
          y1={center}
          x2={center}
          y2={strokeWidth + 15}
          stroke={strokeColor}
          strokeWidth="3"
          strokeLinecap="round"
        />
        <circle cx={center} cy={center} r="6" fill={strokeColor} />
      </g>
    </svg>
  )
}

/**
 * RiskGauge component displays the overall risk score as a semi-circular gauge.
 *
 * Shows:
 * - A visual gauge from 0-100
 * - The numeric score
 * - The risk level label (standard/cautious/aggressive)
 * - Color coding: green for standard, yellow for cautious, red for aggressive
 */
export function RiskGauge() {
  const results = useAnalysisStore((state) => state.results)

  // Don't render if no results
  if (!results) {
    return null
  }

  const { overallRiskScore, overallRiskLevel } = results
  const riskLevel = deriveRiskLevel(overallRiskScore, overallRiskLevel)
  const config = riskLevelConfig[riskLevel]
  const displayScore = overallRiskScore ?? 0

  return (
    <div className="rounded-lg border bg-card p-4">
      <h3 className="text-center font-medium">Risk Assessment</h3>

      {/* Gauge */}
      <div className="mt-2">
        <GaugeSvg score={displayScore} strokeColor={config.strokeColor} />
      </div>

      {/* Score display */}
      <div className="-mt-2 text-center">
        <span className={`text-4xl font-bold ${config.colorClass}`}>
          {overallRiskScore !== null ? displayScore : "--"}
        </span>
        <span className="text-lg text-muted-foreground">/100</span>
      </div>

      {/* Risk level label */}
      <p className={`mt-1 text-center text-sm font-medium ${config.colorClass}`}>
        {config.label}
      </p>

      {/* Score scale */}
      <div className="mt-4 flex justify-between text-xs text-muted-foreground">
        <span>0 - Low</span>
        <span>100 - High</span>
      </div>
    </div>
  )
}
