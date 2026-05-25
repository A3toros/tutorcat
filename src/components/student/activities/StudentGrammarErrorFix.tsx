'use client'

import React, { useState } from 'react'
import { Button, Card, Input } from '@/components/ui'
import type { StudentActivityProps } from '../activityProps'

export default function StudentGrammarErrorFix({ activity, onComplete }: StudentActivityProps) {
  const items = activity.grammar_items || []
  const [index, setIndex] = useState(0)
  const [value, setValue] = useState('')
  const [correct, setCorrect] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const current = items[index]
  if (!current) return null

  const normalize = (s: string) =>
    s
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/[.!?,:;]+$/g, '')
      .trim()

  const handleCheck = () => {
    if (normalize(value) === normalize(current.correct_sentence || '')) {
      const next = correct + 1
      if (index + 1 >= items.length) {
        onComplete({ score: items.length, maxScore: items.length, attempts: 1 })
      } else {
        setCorrect(next)
        setIndex((i) => i + 1)
        setValue('')
        setError(null)
      }
    } else {
      setError('Not quite — check your sentence.')
    }
  }

  return (
    <Card className="p-4 sm:p-6">
      <h2 className="text-xl font-semibold text-slate-800 mb-2">
        {activity.title || 'Fix the mistake'}
      </h2>
      <p className="text-red-700 line-through mb-4">{current.original_sentence}</p>
      <Input
        className="max-w-lg"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Write the correct sentence"
      />
      {error && <p className="text-red-600 text-sm mt-2">{error}</p>}
      <Button className="mt-4" onClick={handleCheck}>
        Check ({index + 1}/{items.length})
      </Button>
    </Card>
  )
}
