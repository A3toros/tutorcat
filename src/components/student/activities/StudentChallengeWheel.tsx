'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { Button, Card } from '@/components/ui'
import type { StudentActivityProps } from '../activityProps'
import StudentSpeakingRecorder, { type SpeechFeedbackPayload } from '../StudentSpeakingRecorder'
import { buildWheelSpeechPrompt } from '@/lib/studentSpeechApi'
import SpinWheel from './SpinWheel'

export default function StudentChallengeWheel({ activity, lesson, onComplete }: StudentActivityProps) {
  const prompts = useMemo(
    () => ((activity.content?.prompts as string[]) || []).filter(Boolean),
    [activity.content?.prompts]
  )
  const duration = Number(activity.content?.duration_seconds) || 30
  const [topic, setTopic] = useState<string | null>(null)
  const [topicIndex, setTopicIndex] = useState<number | null>(null)
  const [timerOn, setTimerOn] = useState(false)
  const [secondsLeft, setSecondsLeft] = useState(duration)
  const [hasSpun, setHasSpun] = useState(false)
  const [wheelSize, setWheelSize] = useState(300)
  const [speechResult, setSpeechResult] = useState<SpeechFeedbackPayload | null>(null)

  useEffect(() => {
    const update = () => setWheelSize(window.innerWidth < 400 ? 260 : 300)
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  useEffect(() => {
    if (!timerOn || secondsLeft <= 0) return
    const t = setTimeout(() => setSecondsLeft((s) => s - 1), 1000)
    return () => clearTimeout(t)
  }, [timerOn, secondsLeft])

  const handleSpinEnd = (index: number, label: string) => {
    setTopicIndex(index)
    setTopic(label)
    setHasSpun(true)
    setTimerOn(false)
    setSecondsLeft(duration)
    setSpeechResult(null)
  }

  const resetForRespin = () => {
    setTopic(null)
    setTopicIndex(null)
    setHasSpun(false)
    setTimerOn(false)
    setSecondsLeft(duration)
    setSpeechResult(null)
  }

  const speechPrompt = topic ? buildWheelSpeechPrompt(topic) : ''

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
        <SpinWheel segments={prompts} size={wheelSize} onSpinEnd={handleSpinEnd} />
      </div>

      {topic && (
        <>
          <div className="rounded-xl border-2 border-purple-200 bg-purple-50 p-4 text-center mb-4">
            <p className="text-xs uppercase tracking-wide text-purple-600 font-semibold mb-1">
              Speak about
            </p>
            <p className="text-xl sm:text-2xl font-bold text-purple-900">{topic}</p>
            {!timerOn ? (
              <Button
                variant="secondary"
                className="mt-4 w-full sm:w-auto"
                onClick={() => setTimerOn(true)}
              >
                Optional: start {duration}s practice timer
              </Button>
            ) : (
              <div className="mt-4">
                <p
                  className={`text-4xl sm:text-5xl font-bold tabular-nums ${
                    secondsLeft <= 5 ? 'text-rose-600 animate-pulse' : 'text-slate-800'
                  }`}
                >
                  {secondsLeft > 0 ? `${secondsLeft}s` : "Time's up!"}
                </p>
                <p className="text-sm text-slate-500 mt-1">Practice timer — record below when ready.</p>
              </div>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 mb-4">
            <p className="text-sm font-semibold text-slate-700 mb-3 text-center">
              Record your answer (AI transcribe &amp; feedback)
            </p>
            <StudentSpeakingRecorder
              key={`wheel-${topicIndex}-${topic}-${speechResult ? 'done' : 'pending'}`}
              promptText={speechPrompt}
              promptId={`${activity.id}-wheel-${topicIndex ?? topic}`}
              lessonId={lesson.id}
              minWords={40}
              maxRecordingSeconds={90}
              cefrLevel="A1"
              onSuccess={setSpeechResult}
              onRerecord={() => setSpeechResult(null)}
            />
          </div>
        </>
      )}

      <div className="flex flex-col sm:flex-row gap-2 justify-center">
        {hasSpun && (
          <Button variant="secondary" onClick={resetForRespin}>
            Spin again
          </Button>
        )}
        <Button
          disabled={!speechResult}
          onClick={() =>
            onComplete({
              score: 1,
              maxScore: 1,
              attempts: 1,
              answers: {
                topic,
                transcript: speechResult?.transcript,
                overall_score: speechResult?.overall_score,
              },
              feedback: speechResult,
              timeSpent: duration,
            })
          }
        >
          Finish challenge
        </Button>
      </div>
    </Card>
  )
}
