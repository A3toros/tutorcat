'use client'

import React from 'react'
import { Button, Card } from '@/components/ui'
import type { StudentActivityProps } from '../activityProps'

export default function StudentGrammarBuilder({ activity, lesson, onComplete }: StudentActivityProps) {
  const focus = (lesson.grammar_focus || activity.content || {}) as Record<
    string,
    { title?: string; structure?: string; examples?: string[]; ladder?: string[] }
  >

  const sections = [
    { key: 'simple_present', title: 'Simple Present' },
    { key: 'frequency_adverbs', title: 'Frequency adverbs' },
    { key: 'like_dislike', title: 'Like / dislike + because' },
    { key: 'question_forms', title: 'Question forms' },
  ]

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
        onClick={() => onComplete({ score: 1, maxScore: 1, attempts: 1, answers: { read: true } })}
      >
        I&apos;m ready to practice
      </Button>
    </Card>
  )
}
