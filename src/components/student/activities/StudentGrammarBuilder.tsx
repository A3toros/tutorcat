'use client'

import React, { useEffect, useState } from 'react'
import { Button, Card } from '@/components/ui'
import type { StudentActivityProps } from '../activityProps'

export default function StudentGrammarBuilder({ activity, lesson, onComplete }: StudentActivityProps) {
  const studySeconds = Math.max(0, Number(activity.content?.study_seconds) || 60)
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

  const formatCountdown = (seconds: number): string => {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  const focus = (lesson.grammar_focus || activity.content || {}) as Record<
    string,
    { title?: string; structure?: string; examples?: string[]; ladder?: string[] }
  >

  const titleForKey = (key: string) =>
    ({
      simple_present: 'Simple Present',
      frequency_adverbs: 'Frequency adverbs',
      like_dislike: 'Like / dislike + because',
      question_forms: 'Question forms',
      opinions: 'Opinions (I think…)',
      adjectives: 'Adjectives for opinions',
    }[key] || key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()))

  const sections = Object.keys(focus).map((key) => ({ key, title: titleForKey(key) }))

  return (
    <Card className="p-4 sm:p-6">
      <h2 className="text-xl font-semibold text-slate-800 mb-4">
        {activity.title || 'Grammar builder'}
      </h2>
      <div className="space-y-4">
        {sections.map(({ key, title }) => {
          const block = focus[key]
          if (!block) return null
          return (
            <details key={key} className="rounded-lg border border-slate-200 bg-slate-50 p-4" open>
              <summary className="cursor-pointer font-semibold text-purple-800">{title}</summary>
              {block.structure && (
                <p className="mt-2 text-sm text-slate-600">
                  <strong>Structure:</strong> {block.structure}
                </p>
              )}
              {block.ladder && (
                <p className="mt-2 text-sm text-slate-600">
                  <strong>Ladder:</strong> {block.ladder.join(' → ')}
                </p>
              )}
              <ul className="mt-2 list-disc pl-5 text-slate-800">
                {(block.examples || []).map((ex, i) => (
                  <li key={i}>{ex}</li>
                ))}
              </ul>
            </details>
          )
        })}
      </div>
      <Button
        className="mt-6"
        disabled={!canContinue}
        onClick={() =>
          onComplete({
            score: 1,
            maxScore: 1,
            attempts: 1,
            answers: { read: true, studySeconds },
          })
        }
      >
        {canContinue ? "I'm ready to practice" : `Wait ${formatCountdown(secondsLeft)}`}
      </Button>
      {!canContinue && (
        <p className="text-xs text-slate-500 text-center mt-2">
          Read the rules — Continue unlocks when the timer ends.
        </p>
      )}
    </Card>
  )
}
