'use client'

import React, { useMemo, useState } from 'react'
import { Button, Card } from '@/components/ui'
import type { StudentActivityProps } from '../activityProps'

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

function parseAccepted(item: { correct_sentence?: string | null; options?: unknown }): string[] {
  const expected = item.correct_sentence || 'What app do you use?'
  const fromOptions =
    item.options &&
    typeof item.options === 'object' &&
    !Array.isArray(item.options) &&
    Array.isArray((item.options as { accepted?: string[] }).accepted)
      ? (item.options as { accepted: string[] }).accepted
      : []
  return [expected, ...fromOptions]
}

export default function StudentGrammarMakeQuestion({ activity, onComplete }: StudentActivityProps) {
  const item = activity.grammar_items?.[0]
  const words = useMemo(
    () => parseWordsArray(item?.words_array),
    [item?.words_array]
  )
  const accepted = useMemo(
    () => (item ? parseAccepted(item).map(normalizeSentence) : []),
    [item]
  )
  const correctOrder = useMemo(() => {
    if (!item?.correct_sentence) return words
    const normalized = normalizeSentence(item.correct_sentence)
    const ordered: string[] = []
    let rest = normalized
    const sortedWords = [...words].sort((a, b) => b.length - a.length)
    for (const w of sortedWords) {
      const nw = normalizeSentence(w)
      if (rest.startsWith(nw + ' ') || rest === nw) {
        ordered.push(w)
        rest = rest.slice(nw.length).trim()
      } else if (rest.startsWith(nw)) {
        ordered.push(w)
        rest = rest.slice(nw.length).trim()
      }
    }
    return ordered.length === words.length ? ordered : words
  }, [item?.correct_sentence, words])

  const [built, setBuilt] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)

  const remaining = words.filter((w) => !built.includes(w))

  const resetSentence = () => {
    setBuilt([])
    setError(null)
  }

  const addWord = (word: string) => setBuilt((prev) => [...prev, word])

  const checkSentence = () => {
    const attempt = normalizeSentence(built.join(' '))
    if (accepted.includes(attempt)) {
      onComplete({
        score: 1,
        maxScore: 1,
        attempts: 1,
        answers: { sentence: built.join(' '), built },
      })
      return
    }
    setError(
      `Not quite. For this question, start with "${correctOrder[0] || 'what app'}", then tap the other words in order.`
    )
    setBuilt([])
  }

  if (!item || words.length === 0) {
    return (
      <Card className="p-4 sm:p-6">
        <p className="text-slate-600">No question words configured.</p>
      </Card>
    )
  }

  return (
    <Card className="p-4 sm:p-6">
      <h2 className="text-lg sm:text-xl font-semibold text-slate-800 mb-2">
        {activity.title || 'Make a question'}
      </h2>
      <p className="text-slate-600 text-sm mb-2">
        {activity.description || 'Put the words in order to make a question.'}
      </p>
      <p className="text-sm text-purple-800 bg-purple-50 border border-purple-100 rounded-lg px-3 py-2 mb-4">
        Ask: <strong>Which app do you use?</strong> — start with the words{' '}
        <strong>{correctOrder[0] || 'what app'}</strong>.
      </p>

      <div className="min-h-[48px] rounded-lg border border-purple-200 bg-purple-50 p-3 mb-4">
        <p className="text-lg text-slate-800">
          {built.length ? built.join(' ') : 'Tap words in order…'}
          {built.length === words.length ? '?' : ''}
        </p>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {remaining.map((w) => (
          <button
            key={w}
            type="button"
            onClick={() => addWord(w)}
            className="rounded-full border border-slate-200 bg-white px-3 py-2 text-sm min-h-[44px] touch-manipulation hover:bg-purple-50 active:bg-purple-50"
          >
            {w}
          </button>
        ))}
      </div>

      {error && (
        <p className="text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-sm mb-3">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
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
