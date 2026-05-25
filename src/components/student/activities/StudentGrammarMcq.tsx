'use client'

import React, { useMemo, useState } from 'react'
import { Button, Card } from '@/components/ui'
import type { StudentActivityProps } from '../activityProps'

const BLANK_LABEL = '(blank)'

function toChoiceValue(opt: string): string {
  if (opt === '' || opt === BLANK_LABEL) return BLANK_LABEL
  return opt
}

function choiceToAnswer(value: string): string {
  return value === BLANK_LABEL ? '' : value
}

function parseOptions(raw: unknown): { choices: string[]; correct: string } {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const o = raw as { choices?: string[]; correct?: string }
    const choices = (o.choices || []).map((c) => toChoiceValue(String(c)))
    const correct = toChoiceValue(String(o.correct ?? ''))
    return { choices, correct }
  }
  if (Array.isArray(raw)) {
    return { choices: raw.map((c) => toChoiceValue(String(c))), correct: '' }
  }
  return { choices: [], correct: '' }
}

export default function StudentGrammarMcq({ activity, onComplete }: StudentActivityProps) {
  const items = activity.grammar_items || []
  const [index, setIndex] = useState(0)
  const [selected, setSelected] = useState<string | null>(null)
  const [correct, setCorrect] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const current = items[index]
  if (!current) return null

  const { choices, correct: correctChoice } = useMemo(
    () => parseOptions(current.options),
    [current.options]
  )

  const fallbackCorrect = toChoiceValue(current.correct_sentence || '')

  const handleCheck = () => {
    if (selected === null) return
    const answer = choiceToAnswer(selected)
    const expected = choiceToAnswer(correctChoice || fallbackCorrect)
    if (answer === expected) {
      const next = correct + 1
      if (index + 1 >= items.length) {
        onComplete({
          score: items.length,
          maxScore: items.length,
          attempts: 1,
          answers: { completed: items.length },
        })
      } else {
        setCorrect(next)
        setIndex((i) => i + 1)
        setSelected(null)
        setError(null)
      }
    } else {
      setError('Try again.')
    }
  }

  return (
    <Card className="p-4 sm:p-6">
      <h2 className="text-lg sm:text-xl font-semibold text-slate-800 mb-1">
        {activity.title || 'Choose the answer'}
      </h2>
      <p className="text-xs text-slate-500 mb-3">
        Question {index + 1} of {items.length}
      </p>
      <p className="text-lg text-slate-800 mb-4">
        {current.original_sentence || current.correct_sentence}
      </p>
      <div className="grid gap-2">
        {choices.map((opt, i) => (
          <button
            key={`${index}-${i}-${opt}`}
            type="button"
            onClick={() => {
              setSelected(opt)
              setError(null)
            }}
            className={`rounded-lg border px-4 py-3 text-left min-h-[48px] touch-manipulation ${
              selected === opt
                ? 'border-purple-500 bg-purple-50 ring-2 ring-purple-200'
                : 'border-slate-200 bg-white active:bg-purple-50'
            }`}
            aria-pressed={selected === opt}
          >
            {opt === BLANK_LABEL ? (
              <span className="text-slate-600 italic">Leave blank (no word)</span>
            ) : (
              opt
            )}
          </button>
        ))}
      </div>
      {error && <p className="text-amber-800 text-sm mt-3">{error}</p>}
      <Button className="mt-4 w-full sm:w-auto" onClick={handleCheck} disabled={selected === null}>
        Check
      </Button>
    </Card>
  )
}
