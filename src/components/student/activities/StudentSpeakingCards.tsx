'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Button, Card } from '@/components/ui'
import type { StudentActivityProps } from '../activityProps'
import StudentSpeakingRecorder, { type SpeechFeedbackPayload } from '../StudentSpeakingRecorder'
import { speakingCardsTotals } from '@/lib/studentLessonScoring'

function storageKey(lessonId: string, activityId: string) {
  return `student-speaking-cards-${lessonId}-${activityId}`
}

function firstIncompleteIndex(
  promptsLen: number,
  results: Record<number, SpeechFeedbackPayload>
): number {
  if (promptsLen <= 0) return 0
  for (let i = 0; i < promptsLen; i++) {
    const r = results[i]
    if (!r || r.overall_score < 50) return i
  }
  return 0
}

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
  const didApplyDbResumeRef = useRef(false)

  // Restore from DB (speech_jobs) so completed cards stay completed across refresh/device.
  useEffect(() => {
    let cancelled = false
    const loadFromDb = async () => {
      try {
        const res = await fetch(
          `/.netlify/functions/get-speech-jobs-by-lesson?lesson_id=${encodeURIComponent(lesson.id)}`,
          { method: 'GET' }
        )
        if (!res.ok) return
        const data = (await res.json()) as { jobs?: Array<any> }
        const jobs = Array.isArray(data.jobs) ? data.jobs : []

        const prefix = `${activity.id}-card-`
        const bestByIndex = new Map<number, SpeechFeedbackPayload>()

        for (const j of jobs) {
          const promptId = typeof j?.prompt_id === 'string' ? j.prompt_id : ''
          if (!promptId.startsWith(prefix)) continue
          const idxRaw = promptId.slice(prefix.length)
          const idx = Number(idxRaw)
          if (!Number.isFinite(idx) || idx < 0) continue

          const status = String(j?.status || '')
          const result = (j?.result || {}) as any
          const transcript = typeof j?.transcript === 'string' ? j.transcript : ''

          // Only consider completed jobs with a numeric score.
          if (status !== 'completed') continue
          if (typeof result?.overall_score !== 'number') continue

          const payload: SpeechFeedbackPayload = {
            transcript,
            overall_score: result.overall_score,
            feedback: typeof result?.feedback === 'string' ? result.feedback : '',
            grammar_corrections: Array.isArray(result?.grammar_corrections) ? result.grammar_corrections : [],
            vocabulary_corrections: Array.isArray(result?.vocabulary_corrections)
              ? result.vocabulary_corrections
              : [],
            is_off_topic: Boolean(result?.is_off_topic),
            integrity: result?.integrity,
          }

          const prev = bestByIndex.get(idx)
          if (!prev || payload.overall_score > prev.overall_score) bestByIndex.set(idx, payload)
        }

        if (cancelled) return
        if (bestByIndex.size === 0) return

        setResults((prev) => {
          const next = { ...prev }
          for (const [k, v] of bestByIndex.entries()) {
            const existing = next[k]
            if (!existing || v.overall_score > existing.overall_score) next[k] = v
          }
          // Only auto-jump once on initial resume, so we don't skip feedback.
          if (!didApplyDbResumeRef.current && prompts.length > 0) {
            didApplyDbResumeRef.current = true
            setIndex(firstIncompleteIndex(prompts.length, next))
          }
          return next
        })
      } catch {
        /* ignore */
      }
    }

    loadFromDb()
    return () => {
      cancelled = true
    }
  }, [lesson.id, activity.id, prompts.length])

  // Restore per-card progress after refresh (do not repeat completed cards).
  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const raw = localStorage.getItem(storageKey(lesson.id, activity.id))
      if (!raw) return
      const parsed = JSON.parse(raw) as { results?: Record<string, SpeechFeedbackPayload>; index?: number }
      const restored: Record<number, SpeechFeedbackPayload> = {}
      for (const [k, v] of Object.entries(parsed.results || {})) {
        const idx = Number(k)
        if (Number.isFinite(idx) && v && typeof v === 'object') restored[idx] = v
      }
      setResults(restored)

      // Jump to first incomplete card (or stay at saved index if it is still incomplete).
      const firstIncomplete = firstIncompleteIndex(prompts.length, restored)
      const preferred = typeof parsed.index === 'number' ? parsed.index : firstIncomplete
      const preferredIsValid =
        preferred >= 0 &&
        preferred < prompts.length &&
        !(restored[preferred] && restored[preferred]!.overall_score >= 50)
      const nextIndex = preferredIsValid ? preferred : firstIncomplete
      setIndex(nextIndex)
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lesson.id, activity.id, prompts.length])

  // Persist progress so refresh resumes where they left off.
  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const payload = {
        index,
        results,
        savedAt: new Date().toISOString(),
      }
      localStorage.setItem(storageKey(lesson.id, activity.id), JSON.stringify(payload))
    } catch {
      /* ignore */
    }
  }, [lesson.id, activity.id, index, results])

  const currentPrompt = prompts[index]
  const currentResult = results[index]
  const currentPassed = Boolean(currentResult && currentResult.overall_score >= 50)
  const allPassed =
    prompts.length > 0 && prompts.every((_, i) => results[i] && results[i]!.overall_score >= 50)

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
        {activity.title || 'Speaking practice'}
      </h2>
      <p className="text-slate-500 text-sm text-center mb-4">
        {activity.description ||
          'Answer each question out loud. AI will listen and give you feedback.'}
      </p>
      <p className="text-slate-500 text-sm text-center mb-4">
        Card {index + 1} of {prompts.length}
      </p>

      <div className="min-h-[100px] flex items-center justify-center rounded-xl bg-gradient-to-br from-purple-50 to-indigo-50 border border-purple-100 p-5 mb-5">
        <p className="text-lg sm:text-xl font-medium text-slate-800 text-center">{currentPrompt}</p>
      </div>

      <StudentSpeakingRecorder
        key={`card-${index}`}
        promptText={currentPrompt}
        promptId={`${activity.id}-card-${index}`}
        lessonId={lesson.id}
        minWords={15}
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
          <Button disabled={!currentPassed} onClick={() => setIndex((i) => i + 1)}>
            Next card
          </Button>
        )}
        {allPassed && (
          <Button
            onClick={() => {
              const { score, maxScore } = speakingCardsTotals(results, prompts.length)
              onComplete({
                score,
                maxScore,
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
            }}
          >
            Finish speaking
          </Button>
        )}
      </div>
    </Card>
  )
}
