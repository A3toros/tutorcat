'use client'

import React, { useMemo, useState } from 'react'
import { Button, Card } from '@/components/ui'
import type { StudentActivityProps } from '../activityProps'
import StudentSpeakingRecorder, { type SpeechFeedbackPayload } from '../StudentSpeakingRecorder'

export default function StudentSpeakingCards({ activity, lesson, onComplete }: StudentActivityProps) {
  const prompts = useMemo(
    () =>
      (activity.content?.prompts as string[])?.length
        ? (activity.content?.prompts as string[])
        : (activity.poll_items || []).map((p) => p.question),
    [activity.content?.prompts, activity.poll_items]
  )

  const [index, setIndex] = useState(0)
  const [results, setResults] = useState<Record<number, SpeechFeedbackPayload>>({})

  const currentPrompt = prompts[index]
  const currentResult = results[index]
  const allRecorded = prompts.length > 0 && prompts.every((_, i) => results[i])

  if (!currentPrompt) {
    return (
      <Card className="p-4 sm:p-6">
        <p className="text-slate-600">No speaking prompts configured.</p>
      </Card>
    )
  }

  return (
    <Card className="p-4 sm:p-6">
      <h2 className="text-lg sm:text-xl font-semibold text-slate-800 text-center mb-1">
        {activity.title || 'Partner questions'}
      </h2>
      <p className="text-slate-500 text-sm text-center mb-4">
        {activity.description || 'Answer each question out loud. AI will transcribe and give feedback.'}
      </p>
      <p className="text-slate-500 text-sm text-center mb-4">
        Card {index + 1} of {prompts.length}
      </p>

      <div className="min-h-[100px] flex items-center justify-center rounded-xl bg-gradient-to-br from-purple-50 to-indigo-50 border border-purple-100 p-5 mb-5">
        <p className="text-lg sm:text-xl font-medium text-slate-800 text-center">{currentPrompt}</p>
      </div>

      <StudentSpeakingRecorder
        key={`card-${index}-${currentResult ? 'done' : 'pending'}`}
        promptText={currentPrompt}
        promptId={`${activity.id}-card-${index}`}
        lessonId={lesson.id}
        minWords={12}
        maxRecordingSeconds={75}
        cefrLevel="A1"
        onSuccess={(result) => setResults((prev) => ({ ...prev, [index]: result }))}
        onRerecord={() =>
          setResults((prev) => {
            const next = { ...prev }
            delete next[index]
            return next
          })
        }
      />

      <div className="flex flex-col sm:flex-row gap-2 justify-center mt-6">
        {index + 1 < prompts.length && (
          <Button disabled={!currentResult} onClick={() => setIndex((i) => i + 1)}>
            Next card
          </Button>
        )}
        {allRecorded && (
          <Button
            onClick={() =>
              onComplete({
                score: prompts.length,
                maxScore: prompts.length,
                attempts: 1,
                answers: {
                  prompts: prompts.map((p, i) => ({
                    prompt: p,
                    transcript: results[i]?.transcript,
                    score: results[i]?.overall_score,
                  })),
                },
                feedback: results,
              })
            }
          >
            Finish speaking
          </Button>
        )}
      </div>
    </Card>
  )
}
