'use client'

import React, { useMemo, useState } from 'react'
import { Button, Card, Select } from '@/components/ui'
import type { StudentActivityProps } from '../activityProps'

type SentenceSlot = {
  template: string
  slot_label: string
  options: string[]
}

function readSentences(content: Record<string, unknown> | undefined): SentenceSlot[] {
  const raw = content?.sentences
  if (!Array.isArray(raw)) return []
  return raw
    .map((row) => {
      const r = row as Record<string, unknown>
      const options = Array.isArray(r.options)
        ? r.options.filter((o): o is string => typeof o === 'string')
        : []
      if (!r.template || options.length === 0) return null
      return {
        template: String(r.template),
        slot_label: String(r.slot_label ?? 'Choose a word'),
        options,
      }
    })
    .filter(Boolean) as SentenceSlot[]
}

export default function StudentCharacterDescription({ activity, onComplete }: StudentActivityProps) {
  const sentences = useMemo(() => readSentences(activity.content), [activity.content])
  const [values, setValues] = useState<Record<number, string>>({})

  const filled = sentences.map((s, i) => {
    const word = values[i] ?? ''
    return s.template.replace('{word}', word || '______')
  })

  const ready = sentences.every((_, i) => Boolean(values[i]))

  if (!sentences.length) {
    return (
      <Card className="p-4 sm:p-6">
        <p className="text-slate-600">No sentences configured.</p>
      </Card>
    )
  }

  return (
    <Card className="p-4 sm:p-6">
      <h2 className="text-lg sm:text-xl font-semibold text-slate-800 mb-2">
        {activity.title || 'Character description'}
      </h2>
      {activity.description && (
        <p className="text-slate-600 text-sm mb-4 whitespace-pre-line">{activity.description}</p>
      )}

      <div className="space-y-4 max-w-lg">
        {sentences.map((s, i) => (
          <div key={i}>
            <label htmlFor={`char-desc-${i}`} className="block text-sm font-medium text-slate-700 mb-1">
              {s.slot_label}
            </label>
            <Select
              id={`char-desc-${i}`}
              value={values[i] ?? ''}
              onChange={(e) => setValues((prev) => ({ ...prev, [i]: e.target.value }))}
              className="min-h-[48px] text-base touch-manipulation w-full mb-1"
            >
              <option value="">Select…</option>
              {s.options.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </Select>
            <p className="text-sm text-slate-600 italic">{filled[i]}</p>
          </div>
        ))}
      </div>

      {ready && (
        <div className="mt-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3">
          <p className="text-xs text-green-800 font-medium mb-2">Your character description</p>
          {filled.map((line, i) => (
            <p key={i} className="text-slate-800 text-sm">
              {line}
            </p>
          ))}
        </div>
      )}

      <Button
        className="mt-6 w-full sm:w-auto"
        disabled={!ready}
        onClick={() =>
          onComplete({
            score: sentences.length,
            maxScore: sentences.length,
            attempts: 1,
            answers: {
              sentences: sentences.map((s, i) => ({
                template: s.template,
                word: values[i],
                sentence: filled[i],
              })),
            },
          })
        }
      >
        Continue
      </Button>
    </Card>
  )
}
