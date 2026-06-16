'use client'

import React, { useMemo, useState } from 'react'
import { Button, Card, Select } from '@/components/ui'
import StudentVocabImage from '@/components/student/StudentVocabImage'
import type { StudentActivityProps } from '../activityProps'

type ImageMcqItem = {
  image_url: string
  prompt: string
  choices: string[]
  correct: string
}

function readItems(content: Record<string, unknown> | undefined): ImageMcqItem[] {
  const raw = content?.items
  if (!Array.isArray(raw)) return []
  return raw
    .map((row) => {
      const r = row as Record<string, unknown>
      const choices = Array.isArray(r.choices)
        ? r.choices.filter((c): c is string => typeof c === 'string')
        : []
      if (!r.image_url || !r.correct || choices.length === 0) return null
      return {
        image_url: String(r.image_url),
        prompt: String(r.prompt ?? 'Match the word'),
        choices,
        correct: String(r.correct),
      }
    })
    .filter(Boolean) as ImageMcqItem[]
}

export default function StudentVocabImageMcq({ activity, onComplete }: StudentActivityProps) {
  const items = useMemo(() => readItems(activity.content), [activity.content])
  const [index, setIndex] = useState(0)
  const [selected, setSelected] = useState('')
  const [correctCount, setCorrectCount] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const current = items[index]

  if (!items.length) {
    return (
      <Card className="p-4 sm:p-6">
        <p className="text-slate-600">No image questions configured.</p>
      </Card>
    )
  }

  if (!current) return null

  const handleCheck = () => {
    if (!selected) return
    if (selected === current.correct) {
      const nextCorrect = correctCount + 1
      if (index + 1 >= items.length) {
        onComplete({
          score: items.length,
          maxScore: items.length,
          attempts: 1,
          answers: { correct: items.length, total: items.length },
        })
      } else {
        setCorrectCount(nextCorrect)
        setIndex((i) => i + 1)
        setSelected('')
        setError(null)
      }
    } else {
      setError('Try again — pick the word that matches the picture.')
    }
  }

  return (
    <Card className="p-4 sm:p-6">
      <h2 className="text-lg sm:text-xl font-semibold text-slate-800 mb-1">
        {activity.title || 'Match image → word'}
      </h2>
      {activity.description && (
        <p className="text-slate-600 text-sm mb-4">{activity.description}</p>
      )}
      <p className="text-xs text-slate-500 mb-4">
        Question {index + 1} of {items.length}
      </p>

      <div className="flex flex-col sm:flex-row gap-4 items-center sm:items-start mb-4">
        <div className="w-40 h-40 rounded-xl border border-slate-200 bg-white flex items-center justify-center overflow-hidden shrink-0">
          <StudentVocabImage
            src={current.image_url}
            alt=""
            className="max-w-full max-h-full object-contain p-2"
          />
        </div>
        <p className="text-lg font-medium text-slate-800 text-center sm:text-left">{current.prompt}</p>
      </div>

      <div className="max-w-md">
        <label htmlFor="vocab-image-mcq" className="block text-sm font-medium text-slate-700 mb-1">
          Choose the word
        </label>
        <Select
          id="vocab-image-mcq"
          value={selected}
          onChange={(e) => {
            setSelected(e.target.value)
            setError(null)
          }}
          className="min-h-[48px] text-base touch-manipulation w-full"
        >
          <option value="">Select…</option>
          {current.choices.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
      </div>

      {error && (
        <p className="mt-3 text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      <Button className="mt-4 w-full sm:w-auto" disabled={!selected} onClick={handleCheck}>
        Check
      </Button>
    </Card>
  )
}
