'use client'

import React, { useMemo, useState } from 'react'
import { Button, Card } from '@/components/ui'
import type { StudentActivityProps } from '../activityProps'

/** Compare sentences without requiring trailing . ! ? */
function normalizeSentence(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[.!?,:;]+$/g, '')
    .trim()
}

function parseWordsArray(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String)
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed.map(String) : []
    } catch {
      return []
    }
  }
  return []
}

export default function StudentGrammarDragOrder({ activity, onComplete }: StudentActivityProps) {
  const items = activity.grammar_items || []
  const [index, setIndex] = useState(0)
  const [built, setBuilt] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [correctCount, setCorrectCount] = useState(0)

  const current = items[index]
  if (!current) {
    return (
      <Card className="p-4 sm:p-6">
        <p className="text-slate-600">No grammar items configured.</p>
      </Card>
    )
  }

  const words = useMemo(() => parseWordsArray(current.words_array), [current.words_array])
  const remaining = words.filter((w) => !built.includes(w))

  const resetSentence = () => setBuilt([])

  const addWord = (word: string) => setBuilt((prev) => [...prev, word])

  const checkSentence = () => {
    const attempt = built.join(' ')
    const expected = current.correct_sentence || ''
    if (normalizeSentence(attempt) === normalizeSentence(expected)) {
      const nextCorrect = correctCount + 1
      if (index + 1 >= items.length) {
        onComplete({
          score: items.length,
          maxScore: items.length,
          attempts: 1,
          answers: { completed: items.length },
        })
      } else {
        setCorrectCount(nextCorrect)
        setIndex((i) => i + 1)
        setBuilt([])
        setError(null)
      }
    } else {
      setError('Not quite — check the word order and try again.')
      setBuilt([])
    }
  }

  return (
    <Card className="p-4 sm:p-6">
      <h2 className="text-xl font-semibold text-slate-800 mb-2">
        {activity.title || 'Sentence order'}
      </h2>
      <p className="text-sm text-slate-500 mb-1">
        Sentence {index + 1} of {items.length}
      </p>
      <p className="text-xs text-slate-500 mb-4">Tap words in order. End punctuation is optional.</p>
      <div className="min-h-[48px] rounded-lg border border-purple-200 bg-purple-50 p-3 mb-4">
        <p className="text-lg text-slate-800">{built.join(' ') || 'Tap words in order…'}</p>
      </div>
      <div className="flex flex-wrap gap-2 mb-4">
        {remaining.map((w) => (
          <button
            key={w}
            type="button"
            onClick={() => addWord(w)}
            className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm hover:bg-purple-50"
          >
            {w}
          </button>
        ))}
      </div>
      {error && <p className="text-red-600 text-sm mb-2">{error}</p>}
      <div className="flex gap-2">
        <Button variant="secondary" onClick={resetSentence}>
          Reset
        </Button>
        <Button onClick={checkSentence} disabled={built.length !== words.length}>
          Check
        </Button>
      </div>
    </Card>
  )
}
