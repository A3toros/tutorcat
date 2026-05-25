'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { Button, Card } from '@/components/ui'
import type { StudentActivityProps } from '../activityProps'

const DEFAULT_DURATION = 45
const DEFAULT_PASS_PERCENT = 50

type Phase = 'ready' | 'playing' | 'results'

function computeScore(
  selected: Set<string>,
  targets: string[],
  distractors: string[]
) {
  let correct = 0
  let wrong = 0
  for (const word of selected) {
    if (targets.includes(word)) correct++
    else if (distractors.includes(word)) wrong++
  }
  const missed = targets.filter((t) => !selected.has(t)).length
  const score = Math.max(0, correct - wrong)
  const maxScore = targets.length
  const percentage =
    maxScore > 0 ? Math.min(100, Math.round((score / maxScore) * 100)) : 100
  return { correct, wrong, missed, score, maxScore, percentage }
}

export default function StudentSpeedTap({ activity, onComplete }: StudentActivityProps) {
  const duration = Number(activity.content?.duration_seconds) || DEFAULT_DURATION
  const passPercent = Number(activity.content?.pass_percent) || DEFAULT_PASS_PERCENT
  const targets = (activity.content?.targets as string[]) || []
  const distractors = (activity.content?.distractors as string[]) || []

  const allWords = useMemo(
    () => [...targets, ...distractors].sort(() => Math.random() - 0.5),
    [targets, distractors]
  )

  const [phase, setPhase] = useState<Phase>('ready')
  const [secondsLeft, setSecondsLeft] = useState(duration)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (phase !== 'playing') return
    if (secondsLeft <= 0) {
      setPhase('results')
      return
    }
    const t = setTimeout(() => setSecondsLeft((s) => s - 1), 1000)
    return () => clearTimeout(t)
  }, [phase, secondsLeft])

  const startGame = () => {
    setSelected(new Set())
    setSecondsLeft(duration)
    setPhase('playing')
  }

  const toggleWord = (word: string) => {
    if (phase !== 'playing') return
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(word)) next.delete(word)
      else next.add(word)
      return next
    })
  }

  const results = useMemo(
    () => computeScore(selected, targets, distractors),
    [selected, targets, distractors]
  )
  const passed = results.percentage >= passPercent

  const wordButtonClass = (word: string) => {
    const isTarget = targets.includes(word)
    const isSelected = selected.has(word)
    if (!isSelected) {
      return 'border-slate-200 bg-white text-slate-800 active:bg-purple-50'
    }
    return isTarget
      ? 'border-green-500 bg-green-50 text-green-900 ring-2 ring-green-200'
      : 'border-red-400 bg-red-50 text-red-900 ring-2 ring-red-200'
  }

  const handleNext = () => {
    onComplete({
      score: results.score,
      maxScore: results.maxScore,
      attempts: 1,
      timeSpent: duration - (phase === 'results' ? secondsLeft : duration),
      answers: {
        selected: [...selected],
        correct: results.correct,
        wrong: results.wrong,
        missed: results.missed,
        percentage: results.percentage,
      },
      feedback: { passed, passPercent, percentage: results.percentage },
    })
  }

  return (
    <Card className="p-4 sm:p-6">
      <h2 className="text-lg sm:text-xl font-semibold text-slate-800 mb-2">
        {activity.title || 'Speed challenge'}
      </h2>
      <p className="text-slate-600 text-sm mb-4">
        Tap <strong>activity</strong> words only. Tap again to unselect. Avoid distractors!
      </p>

      {phase === 'ready' && (
        <>
          <p className="text-sm text-slate-500 mb-4">
            You have <strong>{duration} seconds</strong>. Pass with {passPercent}% or higher.
          </p>
          <Button onClick={startGame}>Start</Button>
        </>
      )}

      {phase === 'playing' && (
        <>
          <p className="text-2xl font-bold text-purple-600 mb-1 tabular-nums">{secondsLeft}s</p>
          <p className="text-xs text-slate-500 mb-4">Tap to select · tap again to unselect</p>
          <div className="flex flex-wrap gap-2">
            {allWords.map((word) => (
              <button
                key={word}
                type="button"
                onClick={() => toggleWord(word)}
                className={`rounded-lg border px-4 py-2.5 text-sm font-medium min-h-[44px] touch-manipulation select-none transition-colors ${wordButtonClass(word)}`}
                aria-pressed={selected.has(word)}
              >
                {word}
              </button>
            ))}
          </div>
        </>
      )}

      {phase === 'results' && (
        <div className="space-y-4">
          <div
            className={`rounded-lg border px-4 py-3 ${
              passed
                ? 'border-green-200 bg-green-50'
                : 'border-amber-200 bg-amber-50'
            }`}
          >
            <p
              className={`text-lg font-semibold ${passed ? 'text-green-800' : 'text-amber-900'}`}
            >
              {passed ? 'You passed!' : 'Not quite — keep practicing'}
            </p>
            <p className="text-2xl font-bold text-slate-800 mt-1 tabular-nums">
              {results.percentage}%
            </p>
            <p className="text-xs text-slate-600 mt-1">Need {passPercent}% to pass</p>
          </div>

          <ul className="text-sm text-slate-700 space-y-1.5">
            <li>
              Activity words selected:{' '}
              <strong>
                {results.correct} / {targets.length}
              </strong>
            </li>
            <li>
              Wrong words selected: <strong>{results.wrong}</strong>
            </li>
            <li>
              Activity words missed: <strong>{results.missed}</strong>
            </li>
            <li>
              Score: <strong>{results.score}</strong> / {results.maxScore}
            </li>
          </ul>

          <div className="flex flex-wrap gap-2 pt-2">
            {allWords.map((word) => {
              const isTarget = targets.includes(word)
              const wasSelected = selected.has(word)
              let label = 'ok'
              if (isTarget && wasSelected) label = 'correct'
              else if (isTarget && !wasSelected) label = 'missed'
              else if (!isTarget && wasSelected) label = 'wrong'
              return (
                <span
                  key={word}
                  className={`rounded-full border px-3 py-1 text-xs font-medium ${
                    label === 'correct'
                      ? 'border-green-400 bg-green-50 text-green-800'
                      : label === 'wrong'
                        ? 'border-red-300 bg-red-50 text-red-800'
                        : label === 'missed'
                          ? 'border-amber-300 bg-amber-50 text-amber-800'
                          : 'border-slate-200 bg-slate-50 text-slate-500'
                  }`}
                >
                  {word}
                  {label === 'missed' ? ' (missed)' : label === 'wrong' ? ' ✗' : wasSelected && isTarget ? ' ✓' : ''}
                </span>
              )
            })}
          </div>

          <div className="flex flex-col sm:flex-row gap-2 pt-2">
            {!passed && (
              <Button variant="secondary" className="w-full sm:w-auto" onClick={startGame}>
                Try again
              </Button>
            )}
            <Button className="w-full sm:w-auto" onClick={handleNext}>
              Next
            </Button>
          </div>
        </div>
      )}
    </Card>
  )
}
