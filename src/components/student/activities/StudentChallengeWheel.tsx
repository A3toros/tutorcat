'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { Button, Card } from '@/components/ui'
import type { StudentActivityProps } from '../activityProps'
import StudentSpeakingRecorder, { type SpeechFeedbackPayload } from '../StudentSpeakingRecorder'
import SpinWheel from './SpinWheel'
import { challengeWheelTotals } from '@/lib/studentLessonScoring'

export default function StudentChallengeWheel({ activity, lesson, onComplete }: StudentActivityProps) {
  const prompts = useMemo(
    () => ((activity.content?.prompts as string[]) || []).filter(Boolean),
    [activity.content?.prompts]
  )
  const [topic, setTopic] = useState<string | null>(null)
  const [topicIndex, setTopicIndex] = useState<number | null>(null)
  const [hasSpun, setHasSpun] = useState(false)
  const [wheelSize, setWheelSize] = useState(300)
  const [speechResult, setSpeechResult] = useState<SpeechFeedbackPayload | null>(null)
  const [recorderBusy, setRecorderBusy] = useState(false)

  useEffect(() => {
    const update = () => setWheelSize(window.innerWidth < 400 ? 260 : 300)
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  const handleSpinEnd = (index: number, label: string) => {
    setTopicIndex(index)
    setTopic(label)
    setHasSpun(true)
    setSpeechResult(null)
  }

  const speechPrompt = topic ? topic.trim() : ''

  return (
    <Card className="p-4 sm:p-6">
      <h2 className="text-lg sm:text-xl font-semibold text-slate-800 text-center mb-1">
        {activity.title || '30-second challenge'}
      </h2>
      <p className="text-sm text-slate-500 text-center mb-6">
        {activity.description ||
          'Spin the wheel, speak about the topic, then get AI feedback.'}
      </p>

      <div className="flex justify-center mb-6">
        <SpinWheel
          segments={prompts}
          size={wheelSize}
          onSpinEnd={handleSpinEnd}
          disabled={hasSpun}
        />
      </div>

      {topic && (
        <>
          <div className="rounded-xl border-2 border-purple-200 bg-purple-50 p-4 text-center mb-4">
            <p className="text-xs uppercase tracking-wide text-purple-600 font-semibold mb-1">
              Speak about
            </p>
            <p className="text-xl sm:text-2xl font-bold text-purple-900">{topic}</p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 mb-4">
            <p className="text-sm font-semibold text-slate-700 mb-3 text-center">
              Record your answer (AI transcribe &amp; feedback)
            </p>
            <StudentSpeakingRecorder
              key={`wheel-${topicIndex}-${topic}`}
              promptText={speechPrompt}
              promptId={`${activity.id}-wheel-${topicIndex ?? topic}`}
              lessonId={lesson.id}
              activityType={activity.activity_type}
              minWords={30}
              maxRecordingSeconds={90}
              cefrLevel="B1"
              onBusyChange={setRecorderBusy}
              onSuccess={setSpeechResult}
              onRerecord={() => setSpeechResult(null)}
            />
          </div>
        </>
      )}

      <div className="flex flex-col sm:flex-row gap-2 justify-center">
        {!recorderBusy && (speechResult?.overall_score ?? 0) >= 50 && (
          <Button
            onClick={() => {
              if (!speechResult || speechResult.overall_score < 50) return
              const { score, maxScore } = challengeWheelTotals(speechResult.overall_score)
              onComplete({
                score,
                maxScore,
                attempts: 1,
                answers: {
                  topic,
                  transcript: speechResult.transcript,
                  overall_score: speechResult.overall_score,
                },
                feedback: speechResult,
              })
            }}
          >
            Finish challenge
          </Button>
        )}
      </div>
    </Card>
  )
}
