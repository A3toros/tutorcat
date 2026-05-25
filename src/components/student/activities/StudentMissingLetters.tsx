'use client'

import React, { useState } from 'react'
import { Button, Card, Input } from '@/components/ui'
import type { StudentActivityProps } from '../activityProps'

type SentenceItem = { template: string; answer: string }

/** Case-insensitive; ignores extra spaces and punctuation (., !, ?, etc.). */
export function normalizeSpellingAnswer(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
}

function answersMatch(typed: string, expected: string): boolean {
  const a = normalizeSpellingAnswer(typed)
  const b = normalizeSpellingAnswer(expected)
  return a.length > 0 && a === b
}

export default function StudentMissingLetters({ activity, onComplete }: StudentActivityProps) {
  const sentences = (activity.content?.sentences as SentenceItem[]) || []
  const [index, setIndex] = useState(0)
  const [inputs, setInputs] = useState<Record<number, string>>({})
  const [error, setError] = useState<string | null>(null)

  const current = sentences[index]
  const isLast = index >= sentences.length - 1
  const total = sentences.length

  const handleNext = () => {
    if (!current) return
    setError(null)

    const typed = inputs[index] || ''
    if (!answersMatch(typed, current.answer)) {
      setError('Not quite — check the spelling and try again.')
      return
    }

    if (isLast) {
      onComplete({
        score: total,
        maxScore: total,
        attempts: 1,
        answers: { inputs },
      })
      return
    }

    setIndex((i) => i + 1)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleNext()
    }
  }

  if (!sentences.length) {
    return (
      <Card className="p-4 sm:p-6">
        <p className="text-slate-600">No spelling items configured.</p>
      </Card>
    )
  }

  return (
    <Card className="p-4 sm:p-6">
      <h2 className="text-lg sm:text-xl font-semibold text-slate-800 mb-2">
        {activity.title || 'Missing letters'}
      </h2>
      {activity.description && (
        <p className="text-slate-600 text-sm mb-4">{activity.description}</p>
      )}
      <p className="text-xs text-slate-500 mb-4">
        Word {index + 1} of {total}
      </p>

      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 sm:p-6 mb-4">
        <p className="font-mono text-xl sm:text-2xl text-slate-800 tracking-wide mb-3 sm:mb-4">
          {current.template}
        </p>
        <Input
          className="max-w-md text-lg"
          placeholder="Type the full word or phrase"
          value={inputs[index] || ''}
          onChange={(e) => {
            setInputs((prev) => ({ ...prev, [index]: e.target.value }))
            if (error) setError(null)
          }}
          onKeyDown={handleKeyDown}
          autoFocus
        />
        <p className="text-xs text-slate-500 mt-2">
          Upper or lower case is fine. Extra punctuation (e.g. . , !) is ignored.
        </p>
      </div>

      {error && (
        <p className="text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-sm mb-4">
          {error}
        </p>
      )}

      <Button onClick={handleNext} disabled={!(inputs[index] || '').trim()}>
        {isLast ? 'Finish' : 'Next'}
      </Button>
    </Card>
  )
}
