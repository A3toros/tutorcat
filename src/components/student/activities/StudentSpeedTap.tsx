'use client'

import React, { useMemo, useState } from 'react'
import { Button, Card } from '@/components/ui'
import type { StudentActivityProps } from '../activityProps'

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((w): w is string => typeof w === 'string' && w.length > 0)
}

function parseActivityContent(content: unknown): Record<string, unknown> {
  if (!content) return {}
  if (typeof content === 'string') {
    try {
      const parsed = JSON.parse(content)
      return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {}
    } catch {
      return {}
    }
  }
  return typeof content === 'object' ? (content as Record<string, unknown>) : {}
}

function isSelectionCorrect(
  selected: Set<string>,
  targets: string[],
  distractors: string[]
): boolean {
  if (targets.length === 0) return false
  return (
    targets.every((t) => selected.has(t)) &&
    distractors.every((d) => !selected.has(d))
  )
}

export default function StudentSpeedTap({ activity, onComplete }: StudentActivityProps) {
  const content = useMemo(() => parseActivityContent(activity.content), [activity.content])

  const targets = useMemo(() => readStringArray(content.targets), [content.targets])
  const distractors = useMemo(() => readStringArray(content.distractors), [content.distractors])

  /** Fixed order: activity words first, then distractors (loops on the snake track). */
  const allWords = useMemo(
    () => [...targets, ...distractors],
    [targets, distractors]
  )

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [attempts, setAttempts] = useState(0)
  const [paused, setPaused] = useState(false)
  const [trackKey, setTrackKey] = useState(0)

  const snakeWords = useMemo(() => [...allWords, ...allWords], [allWords])

  const toggleWord = (word: string) => {
    setError(null)
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(word)) next.delete(word)
      else next.add(word)
      return next
    })
  }

  const wordButtonClass = (word: string) => {
    const isTarget = targets.includes(word)
    const isSelected = selected.has(word)
    if (!isSelected) {
      return 'border-slate-200 bg-white text-slate-800 shadow-sm active:bg-purple-50'
    }
    return isTarget
      ? 'border-green-500 bg-green-50 text-green-900 ring-2 ring-green-200'
      : 'border-red-400 bg-red-50 text-red-900 ring-2 ring-red-200'
  }

  const handleContinue = () => {
    if (isSelectionCorrect(selected, targets, distractors)) {
      onComplete({
        score: targets.length,
        maxScore: targets.length,
        attempts: attempts + 1,
        answers: { selected: [...selected] },
        feedback: { passed: true },
      })
      return
    }

    setAttempts((n) => n + 1)
    setError(
      'Select every activity word, and do not select any other words. Try again!'
    )
    setSelected(new Set())
    setTrackKey((k) => k + 1)
  }

  return (
    <Card className="p-4 sm:p-6">
      <style>{`
        @keyframes speed-tap-snake {
          0% {
            transform: translateX(-50%);
          }
          100% {
            transform: translateX(0);
          }
        }
        .speed-tap-snake-track {
          display: flex;
          width: max-content;
          gap: 0.75rem;
          padding: 0 0.5rem;
          animation: speed-tap-snake 22.4s linear infinite;
          will-change: transform;
        }
        .speed-tap-snake-track.is-paused {
          animation-play-state: paused;
        }
        @media (prefers-reduced-motion: reduce) {
          .speed-tap-snake-viewport {
            overflow-x: auto;
          }
          .speed-tap-snake-track {
            animation: none;
            flex-wrap: wrap;
            width: 100%;
            justify-content: center;
          }
        }
      `}</style>

      <h2 className="text-lg sm:text-xl font-semibold text-slate-800 mb-2">
        {activity.title || 'Activity words'}
      </h2>
      <p className="text-slate-600 text-sm mb-4">
        Words move across the screen. Tap <strong>all</strong> activity words only (tap again
        to unselect). Hold the row to pause it. Press <strong>Continue</strong> when you are
        done.
      </p>

      {targets.length === 0 ? (
        <p className="text-sm text-amber-800">This activity has no words configured yet.</p>
      ) : (
        <>
          <p className="text-xs text-slate-500 mb-2">
            Select {targets.length} word{targets.length === 1 ? '' : 's'}
          </p>

          <div
            className="speed-tap-snake-viewport relative overflow-hidden rounded-xl border border-slate-200 bg-gradient-to-r from-slate-50 via-white to-slate-50 py-4 mb-4"
            onPointerDown={() => setPaused(true)}
            onPointerUp={() => setPaused(false)}
            onPointerCancel={() => setPaused(false)}
            onPointerLeave={() => setPaused(false)}
          >
            <div
              key={trackKey}
              className={`speed-tap-snake-track ${paused ? 'is-paused' : ''}`}
              aria-label="Moving word list"
            >
              {snakeWords.map((word, index) => (
                <button
                  key={`${word}-${index}`}
                  type="button"
                  onClick={() => toggleWord(word)}
                  className={`shrink-0 rounded-full border px-4 py-2.5 text-sm font-medium min-h-[44px] touch-manipulation select-none transition-colors ${wordButtonClass(word)}`}
                  aria-pressed={selected.has(word)}
                >
                  {word}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <p
              className="text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4"
              role="alert"
            >
              {error}
            </p>
          )}

          <Button className="w-full sm:w-auto" onClick={handleContinue}>
            Continue
          </Button>
        </>
      )}
    </Card>
  )
}
