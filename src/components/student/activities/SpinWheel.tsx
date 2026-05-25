'use client'

import React, { useCallback, useMemo, useRef, useState } from 'react'

const WHEEL_COLORS = [
  '#7c3aed',
  '#f59e0b',
  '#10b981',
  '#f43f5e',
  '#0ea5e9',
  '#f97316',
  '#8b5cf6',
  '#14b8a6',
  '#ec4899',
  '#6366f1',
  '#84cc16',
  '#06b6d4',
]

const VIEW = 100
const CX = 50
const CY = 50
const OUTER_R = 46
/** Place labels ~60% out from center — inside the slice, away from borders */
const LABEL_R = 28

/** Degrees clockwise from 12 o'clock → x,y in viewBox */
function pointOnWheel(degFromTop: number, radius: number) {
  const rad = ((degFromTop - 90) * Math.PI) / 180
  return {
    x: CX + radius * Math.cos(rad),
    y: CY + radius * Math.sin(rad),
  }
}

function slicePath(startDeg: number, endDeg: number) {
  const start = pointOnWheel(startDeg, OUTER_R)
  const end = pointOnWheel(endDeg, OUTER_R)
  const large = endDeg - startDeg > 180 ? 1 : 0
  return `M ${CX} ${CY} L ${start.x} ${start.y} A ${OUTER_R} ${OUTER_R} 0 ${large} 1 ${end.x} ${end.y} Z`
}

export interface SpinWheelProps {
  segments: string[]
  size?: number
  spinDurationMs?: number
  disabled?: boolean
  onSpinStart?: () => void
  onSpinEnd?: (index: number, label: string) => void
}

export default function SpinWheel({
  segments,
  size = 280,
  spinDurationMs = 4200,
  disabled = false,
  onSpinStart,
  onSpinEnd,
}: SpinWheelProps) {
  const [rotation, setRotation] = useState(0)
  const [spinning, setSpinning] = useState(false)
  const pendingIndex = useRef<number | null>(null)
  const n = segments.length
  const segmentAngle = n > 0 ? 360 / n : 360

  const handleTransitionEnd = useCallback(
    (e: React.TransitionEvent<SVGGElement>) => {
      if (e.propertyName !== 'transform' || !spinning) return
      const idx = pendingIndex.current
      if (idx == null) return
      setSpinning(false)
      pendingIndex.current = null
      onSpinEnd?.(idx, segments[idx] ?? '')
    },
    [spinning, segments, onSpinEnd]
  )

  const spin = useCallback(() => {
    if (disabled || spinning || n === 0) return

    const index = Math.floor(Math.random() * n)
    const minSpins = 5 + Math.floor(Math.random() * 3)
    const targetMod = 360 - (index + 0.5) * segmentAngle
    const currentMod = ((rotation % 360) + 360) % 360
    let delta = targetMod - currentMod
    if (delta <= 0) delta += 360

    pendingIndex.current = index
    onSpinStart?.()
    setSpinning(true)
    setRotation((r) => r + minSpins * 360 + delta)
  }, [disabled, spinning, n, segmentAngle, rotation, onSpinStart])

  const sliceData = useMemo(() => {
    return segments.map((label, i) => {
      const startDeg = i * segmentAngle
      const endDeg = (i + 1) * segmentAngle
      const midDeg = startDeg + segmentAngle / 2
      const pos = pointOnWheel(midDeg, LABEL_R)
      // Radial text: tangent rotation; flip on left side so it stays readable
      let textRotate = midDeg
      if (midDeg > 90 && midDeg < 270) textRotate += 180
      return { label, i, startDeg, endDeg, midDeg, pos, textRotate, color: WHEEL_COLORS[i % WHEEL_COLORS.length] }
    })
  }, [segments, segmentAngle])

  if (n === 0) {
    return (
      <div
        className="rounded-full bg-slate-100 flex items-center justify-center text-slate-500 text-sm"
        style={{ width: size, height: size }}
      >
        No topics
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative" style={{ width: size, height: size }}>
        {/* Pointer at top */}
        <div className="absolute left-1/2 -translate-x-1/2 z-20 -top-1" aria-hidden>
          <div className="w-0 h-0 border-l-[14px] border-r-[14px] border-b-[22px] border-l-transparent border-r-transparent border-b-purple-700 drop-shadow-md" />
        </div>

        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${VIEW} ${VIEW}`}
          className="rounded-full border-[6px] border-purple-800 shadow-lg bg-purple-900"
          aria-label="Spin wheel"
        >
          <g
            style={{
              transform: `rotate(${rotation}deg)`,
              transformOrigin: `${CX}px ${CY}px`,
              transition: spinning
                ? `transform ${spinDurationMs}ms cubic-bezier(0.15, 0.85, 0.2, 1)`
                : 'none',
            }}
            onTransitionEnd={handleTransitionEnd}
          >
            {sliceData.map(({ label, i, startDeg, endDeg, pos, textRotate, color }) => (
              <g key={`slice-${i}`}>
                <path d={slicePath(startDeg, endDeg)} fill={color} stroke="#fff" strokeWidth={0.6} />
                <WheelLabel
                  label={label}
                  segmentCount={n}
                  x={pos.x}
                  y={pos.y}
                  rotate={textRotate}
                />
              </g>
            ))}
          </g>
        </svg>

        <button
          type="button"
          onClick={spin}
          disabled={disabled || spinning}
          className="absolute left-1/2 top-1/2 z-30 -translate-x-1/2 -translate-y-1/2 flex h-[22%] w-[22%] min-h-[52px] min-w-[52px] max-h-[72px] max-w-[72px] items-center justify-center rounded-full border-4 border-white bg-gradient-to-br from-purple-600 to-purple-800 text-white text-xs sm:text-sm font-bold shadow-lg transition-transform hover:scale-105 active:scale-95 disabled:opacity-70 disabled:cursor-not-allowed touch-manipulation"
          aria-label={spinning ? 'Spinning…' : 'Spin the wheel'}
        >
          {spinning ? <span className="animate-pulse">…</span> : 'SPIN'}
        </button>
      </div>

      <button
        type="button"
        onClick={spin}
        disabled={disabled || spinning}
        className="text-sm font-medium text-purple-700 underline-offset-2 hover:underline disabled:opacity-50 touch-manipulation"
      >
        {spinning ? 'Spinning…' : 'Tap SPIN or press here'}
      </button>
    </div>
  )
}

/** Stack topic text on multiple lines (one word per line when possible). */
function splitLabelLines(label: string, segmentCount: number): string[] {
  const words = label.trim().split(/\s+/).filter(Boolean)
  if (words.length <= 1) return [label.trim() || label]

  const maxLines = segmentCount <= 6 ? 4 : 3
  if (words.length <= maxLines) return words

  // Many words: fill lines with ~2 words each
  const lines: string[] = []
  let i = 0
  while (i < words.length && lines.length < maxLines) {
    const wordsLeft = words.length - i
    const linesLeft = maxLines - lines.length
    const perLine = wordsLeft <= linesLeft ? 1 : Math.min(2, Math.ceil(wordsLeft / linesLeft))
    lines.push(words.slice(i, i + perLine).join(' '))
    i += perLine
  }
  return lines
}

function WheelLabel({
  label,
  segmentCount,
  x,
  y,
  rotate,
}: {
  label: string
  segmentCount: number
  x: number
  y: number
  rotate: number
}) {
  const lines = splitLabelLines(label, segmentCount)
  const lineHeight =
    lines.length >= 4 ? 3.6 : lines.length === 3 ? 4 : lines.length === 2 ? 4.6 : 4.8
  const fontSize =
    lines.length >= 4 ? 3 : lines.length === 3 ? 3.4 : lines.length === 2 ? 3.8 : 4
  const startY = y - ((lines.length - 1) * lineHeight) / 2

  return (
    <text
      fill="#fff"
      fontSize={fontSize}
      fontWeight={700}
      textAnchor="middle"
      dominantBaseline="middle"
      transform={`rotate(${rotate}, ${x}, ${y})`}
      style={{ pointerEvents: 'none', userSelect: 'none' }}
    >
      {lines.map((line, li) => (
        <tspan key={li} x={x} y={startY + li * lineHeight}>
          {line}
        </tspan>
      ))}
    </text>
  )
}
