'use client'

import React, { useMemo, useState } from 'react'
import { Button, Card } from '@/components/ui'
import type { StudentActivityProps } from '../activityProps'
import type { StudentGrammarItem } from '@/types/student'

const DEFAULT_CHOICES = ['always', 'sometimes', 'never']

function parseOptions(raw: unknown): { choices: string[]; correct: string } {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const o = raw as { choices?: string[]; correct?: string }
    return {
      choices: o.choices?.length ? o.choices : DEFAULT_CHOICES,
      correct: String(o.correct ?? '').trim(),
    }
  }
  if (typeof raw === 'string') {
    try {
      return parseOptions(JSON.parse(raw))
    } catch {
      return { choices: DEFAULT_CHOICES, correct: '' }
    }
  }
  return { choices: DEFAULT_CHOICES, correct: '' }
}

/** correct may be stored as the word "always" or full sentence "I always use YouTube." */
function resolveCorrectWord(item: StudentGrammarItem): string {
  const { choices, correct: fromOptions } = parseOptions(item.options)
  if (fromOptions && choices.some((c) => c.toLowerCase() === fromOptions.toLowerCase())) {
    return choices.find((c) => c.toLowerCase() === fromOptions.toLowerCase()) || fromOptions
  }

  const sentence = (item.correct_sentence || '').toLowerCase()
  for (const choice of choices) {
    if (sentence.includes(choice.toLowerCase())) {
      return choice
    }
  }

  const legacy = (item.correct_sentence || '').trim()
  if (legacy && choices.includes(legacy)) return legacy
  return 'always'
}

function isCorrectChoice(selected: string, item: StudentGrammarItem): boolean {
  const expected = resolveCorrectWord(item)
  return selected.trim().toLowerCase() === expected.trim().toLowerCase()
}

export default function StudentGrammarFrequency({ activity, onComplete }: StudentActivityProps) {
  const items = activity.grammar_items?.length
    ? activity.grammar_items
    : [
        {
          id: 'default',
          activity_id: '',
          item_kind: 'frequency_select',
          original_sentence: 'I _____ eat pizza every day.',
          correct_sentence: 'always',
          options: { choices: DEFAULT_CHOICES, correct: 'always' },
          sort_order: 1,
        } as StudentGrammarItem,
      ]

  const [index, setIndex] = useState(0)
  const [selected, setSelected] = useState<string | null>(null)
  const [correctCount, setCorrectCount] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const current = items[index]
  const { choices } = useMemo(() => parseOptions(current?.options), [current?.options])

  if (!current) return null

  const handleCheck = () => {
    if (!selected) return
    if (isCorrectChoice(selected, current)) {
      const next = correctCount + 1
      if (index + 1 >= items.length) {
        onComplete({
          score: items.length,
          maxScore: items.length,
          attempts: 1,
          answers: { completed: items.length },
        })
      } else {
        setCorrectCount(next)
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
        {activity.title || 'Frequency words'}
      </h2>
      <p className="text-xs text-slate-500 mb-3">
        Question {index + 1} of {items.length}
      </p>
      <p className="text-lg text-slate-800 mb-4">
        {current.original_sentence || current.correct_sentence}
      </p>
      <div className="flex flex-wrap gap-2">
        {choices.map((opt) => (
          <button
            key={opt}
            type="button"
            onClick={() => {
              setSelected(opt)
              setError(null)
            }}
            className={`rounded-full border px-4 py-2.5 text-sm capitalize min-h-[44px] touch-manipulation ${
              selected === opt
                ? 'border-purple-500 bg-purple-50 ring-2 ring-purple-200'
                : 'border-slate-200 bg-white active:bg-purple-50'
            }`}
            aria-pressed={selected === opt}
          >
            {opt}
          </button>
        ))}
      </div>
      {error && <p className="text-amber-800 text-sm mt-3">{error}</p>}
      <Button
        className="mt-4 w-full sm:w-auto"
        onClick={handleCheck}
        disabled={!selected}
      >
        Check
      </Button>
    </Card>
  )
}
