'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { Button, Card } from '@/components/ui'
import StudentVocabImage from '@/components/student/StudentVocabImage'
import { parseStudentVocabularyItems } from '@/lib/studentLessonNormalize'
import { resolveStudentVocabImageUrl } from '@/lib/studentVocabImages'
import type { StudentActivityProps } from '../activityProps'

const DEFAULT_STUDY_SECONDS = 60

function formatCountdown(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

export default function StudentVocabularyIntro({ activity, onComplete }: StudentActivityProps) {
  const studySeconds = Math.max(
    0,
    Number(activity.content?.study_seconds) || DEFAULT_STUDY_SECONDS
  )
  const [secondsLeft, setSecondsLeft] = useState(studySeconds)
  const canContinue = secondsLeft <= 0

  useEffect(() => {
    setSecondsLeft(studySeconds)
  }, [studySeconds, activity.id])

  useEffect(() => {
    if (secondsLeft <= 0) return
    const id = window.setInterval(() => {
      setSecondsLeft((prev) => (prev <= 1 ? 0 : prev - 1))
    }, 1000)
    return () => window.clearInterval(id)
  }, [secondsLeft])

  const items = useMemo(() => {
    const raw = parseStudentVocabularyItems(activity.vocabulary_items)
    const byWord = new Map<string, (typeof raw)[0]>()
    for (const item of raw) {
      const key = item.english_word.trim().toLowerCase()
      const existing = byWord.get(key)
      if (!existing || (!existing.image_url && item.image_url)) {
        byWord.set(key, item)
      }
    }
    return [...byWord.values()].sort((a, b) => a.sort_order - b.sort_order)
  }, [activity.vocabulary_items])

  const groupByCategory = Boolean(activity.content?.group_by_category)

  const grouped = useMemo(() => {
    if (!groupByCategory) return { All: items }
    return items.reduce<Record<string, typeof items>>((acc, item) => {
      const key = item.category || 'Other'
      if (!acc[key]) acc[key] = []
      acc[key].push(item)
      return acc
    }, {})
  }, [items, groupByCategory])

  return (
    <Card className="p-4 sm:p-6">
      <h2 className="text-lg sm:text-xl font-semibold text-slate-800 mb-2">
        {activity.title || 'Vocabulary'}
      </h2>
      {activity.description && (
        <p className="text-slate-600 text-sm mb-4 sm:mb-6">{activity.description}</p>
      )}
      {Object.entries(grouped).map(([category, words]) => (
        <div key={category} className="mb-6 sm:mb-8">
          {groupByCategory && (
            <h3 className="text-sm font-semibold uppercase tracking-wide text-purple-600 mb-3">
              {category}
            </h3>
          )}
          <div className="grid gap-2 sm:gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {words.map((word) => (
              <div
                key={word.id}
                className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-2.5 sm:p-3"
              >
                <div className="relative h-10 w-10 sm:h-12 sm:w-12 shrink-0 overflow-hidden rounded-md bg-slate-100 flex items-center justify-center">
                  <StudentVocabImage
                    src={resolveStudentVocabImageUrl(word.english_word, word.image_url)}
                    alt={word.english_word}
                  />
                </div>
                <span className="font-medium text-slate-800 text-sm sm:text-base">
                  {word.english_word}
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}

      <div className="flex items-center justify-center gap-3 sm:gap-4 pt-4 mt-2 border-t border-slate-200">
        <div
          className={`min-w-[4.5rem] text-center tabular-nums text-xl font-bold rounded-lg px-3 py-2 ${
            canContinue
              ? 'bg-green-50 text-green-700 border border-green-200'
              : 'bg-purple-50 text-purple-800 border border-purple-200'
          }`}
          aria-live="polite"
          aria-label={canContinue ? 'Ready to continue' : `Time remaining ${secondsLeft} seconds`}
        >
          {canContinue ? 'Ready' : formatCountdown(secondsLeft)}
        </div>
        <Button
          disabled={!canContinue}
          onClick={() =>
            onComplete({
              score: 1,
              maxScore: 1,
              attempts: 1,
              answers: { viewed: true, studySeconds },
            })
          }
        >
          Continue
        </Button>
      </div>
      {!canContinue && (
        <p className="text-xs text-slate-500 text-center mt-2">
          Study the words — Continue unlocks when the timer ends.
        </p>
      )}
    </Card>
  )
}
