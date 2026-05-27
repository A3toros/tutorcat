'use client'

import React, { useState } from 'react'
import { Button, Card } from '@/components/ui'
import type { StudentActivityProps } from '../activityProps'

export default function StudentPollActivity({ activity, onComplete }: StudentActivityProps) {
  const polls = activity.poll_items || []
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)

  const isGraded = polls.some(
    (p: any) => typeof p?.correct_option_id === 'string' && p.correct_option_id
  )
  const allAnswered = polls.every((p) => answers[p.id])
  const allCorrect = !isGraded
    ? true
    : polls.every((p: any) => {
        const picked = answers[p.id]
        const correct = String(p?.correct_option_id || '')
        return Boolean(picked && correct && picked === correct)
      })

  const handleSubmit = () => {
    if (!allAnswered) {
      setError('Please answer all questions.')
      return
    }
    if (!allCorrect) {
      setError('Some answers are not correct. Try again.')
      return
    }
    onComplete({
      score: polls.length,
      maxScore: polls.length,
      attempts: 1,
      answers: { polls: answers },
    })
  }

  return (
    <Card className="p-4 sm:p-6">
      <h2 className="text-xl font-semibold text-slate-800 mb-2">{activity.title || 'Poll'}</h2>
      {activity.description && (
        <p className="text-slate-600 mb-6">{activity.description}</p>
      )}
      <div className="space-y-6">
        {polls.map((poll) => (
          <div key={poll.id}>
            <p className="font-medium text-slate-800 mb-3">{poll.question}</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {(poll.options || []).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => {
                    setAnswers((prev) => ({ ...prev, [poll.id]: opt.id }))
                    setError(null)
                  }}
                  className={`rounded-lg border px-4 py-3 text-left transition ${
                    answers[poll.id] === opt.id
                      ? isGraded &&
                        (poll as any).correct_option_id &&
                        answers[poll.id] !== (poll as any).correct_option_id
                        ? 'border-red-500 bg-red-50 text-red-900'
                        : 'border-purple-500 bg-purple-50 text-purple-900'
                      : 'border-slate-200 hover:border-purple-300'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      {error && <p className="text-red-600 text-sm mt-4">{error}</p>}
      <Button className="mt-6" onClick={handleSubmit} disabled={!allAnswered || (isGraded && !allCorrect)}>
        {isGraded ? 'Check' : 'Continue'}
      </Button>
    </Card>
  )
}
