'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Button, Card } from '@/components/ui'
import { useUser } from '@/components/auth/ProtectedRoute'
import { resolveCharacterWithFallback } from '@/lib/characterBuilder/characterStorage'
import { speakingCardsTotals } from '@/lib/studentLessonScoring'
import CharacterCanvas from '../character-builder/CharacterCanvas'
import StudentSpeakingRecorder, { type SpeechFeedbackPayload } from '../StudentSpeakingRecorder'
import type { StudentActivityProps } from '../activityProps'

const DEFAULT_PROMPTS = [
  'What makes your character special?',
  'What does your character look like?',
  "What is your character's personality?",
  'What does your character like to do?',
]

function storageKey(lessonId: string, activityId: string) {
  return `student-character-story-speaking-${lessonId}-${activityId}`
}

function firstIncompleteIndex(
  promptsLen: number,
  results: Record<number, SpeechFeedbackPayload>
): number {
  if (promptsLen <= 0) return 0
  for (let i = 0; i < promptsLen; i++) {
    if (!cardPassed(results[i])) return i
  }
  return 0
}

function cardPassed(result: SpeechFeedbackPayload | undefined): boolean {
  return Boolean(result && typeof result.overall_score === 'number' && result.overall_score >= 50)
}

function allCardsPassed(
  promptsLen: number,
  results: Record<number, SpeechFeedbackPayload>
): boolean {
  if (promptsLen <= 0) return false
  for (let i = 0; i < promptsLen; i++) {
    if (!cardPassed(results[i])) return false
  }
  return true
}

export default function StudentCharacterStory({
  activity,
  lesson,
  activityResults,
  activities,
  onComplete,
}: StudentActivityProps) {
  const { user } = useUser()
  const userId =
    user?.id ??
    (typeof window !== 'undefined' && (window as any).__ADMIN_LESSON_TEST_MODE ? 'admin-test' : 'guest')

  const sourceOrder =
    typeof activity.content?.source_activity_order === 'number'
      ? Number(activity.content.source_activity_order)
      : undefined

  const [storageTick, setStorageTick] = useState(0)

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key?.startsWith('student-character-')) setStorageTick((t) => t + 1)
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  useEffect(() => {
    setStorageTick((t) => t + 1)
  }, [activityResults])

  const character = useMemo(
    () =>
      resolveCharacterWithFallback({
        lessonId: lesson.id,
        userId,
        activityResults,
        activities,
        sourceActivityOrder: sourceOrder,
      }),
    [lesson.id, userId, activityResults, activities, sourceOrder, storageTick]
  )

  const prompts = useMemo(() => {
    const fromContent = activity.content?.prompts
    if (Array.isArray(fromContent) && fromContent.every((p) => typeof p === 'string') && fromContent.length) {
      return fromContent as string[]
    }
    return DEFAULT_PROMPTS
  }, [activity.content?.prompts])

  const [index, setIndex] = useState(0)
  const [results, setResults] = useState<Record<number, SpeechFeedbackPayload>>({})
  const [recorderBusy, setRecorderBusy] = useState(false)
  const didApplyDbResumeRef = useRef(false)
  const recorderBusyRef = useRef(false)
  const indexRef = useRef(0)
  indexRef.current = index

  const handleBusyChange = (busy: boolean) => {
    recorderBusyRef.current = busy
    setRecorderBusy(busy)
  }

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
          const idx = Number(promptId.slice(prefix.length))
          if (!Number.isFinite(idx) || idx < 0) continue

          const status = String(j?.status || '')
          const result = (j?.result || {}) as any
          const transcript = typeof j?.transcript === 'string' ? j.transcript : ''
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

        if (cancelled || bestByIndex.size === 0) return

        setResults((prev) => {
          const next = { ...prev }
          for (const [k, v] of bestByIndex.entries()) {
            if (recorderBusyRef.current && k === indexRef.current) continue
            const existing = next[k]
            if (!existing || v.overall_score > existing.overall_score) next[k] = v
          }
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

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const raw = localStorage.getItem(storageKey(lesson.id, activity.id))
      if (!raw) return
      const parsed = JSON.parse(raw) as {
        results?: Record<string, SpeechFeedbackPayload>
        index?: number
      }
      const restored: Record<number, SpeechFeedbackPayload> = {}
      for (const [k, v] of Object.entries(parsed.results || {})) {
        const idx = Number(k)
        if (Number.isFinite(idx) && v && typeof v === 'object') restored[idx] = v
      }
      setResults(restored)
      const firstIncomplete = firstIncompleteIndex(prompts.length, restored)
      const preferred = typeof parsed.index === 'number' ? parsed.index : firstIncomplete
      const preferredIsValid =
        preferred >= 0 &&
        preferred < prompts.length &&
        !(restored[preferred] && restored[preferred]!.overall_score >= 50)
      setIndex(preferredIsValid ? preferred : firstIncomplete)
    } catch {
      /* ignore */
    }
  }, [lesson.id, activity.id, prompts.length])

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      localStorage.setItem(
        storageKey(lesson.id, activity.id),
        JSON.stringify({ index, results, savedAt: new Date().toISOString() })
      )
    } catch {
      /* ignore */
    }
  }, [lesson.id, activity.id, index, results])

  const currentPrompt = prompts[index]
  const currentPassed = cardPassed(results[index])
  const allPassed = allCardsPassed(prompts.length, results)
  const canGoNext = currentPassed && !recorderBusy
  const canFinish = allPassed && !recorderBusy

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
        {activity.title || 'Character story'}
      </h2>
      <p className="text-slate-500 text-sm text-center mb-4">
        {activity.description ||
          'Talk about your character. Answer each question out loud — AI will listen and give feedback.'}
      </p>

      <div className="flex flex-col items-center gap-2 mb-5 p-4 rounded-xl border border-purple-100 bg-purple-50/40">
        {character.characterName ? (
          <p className="text-lg font-bold text-purple-900">{character.characterName}</p>
        ) : null}
        {character.preview_image ? (
          <img
            src={character.preview_image}
            alt={character.characterName ? `${character.characterName} character` : 'Your character'}
            className="w-full max-w-[240px] rounded-xl border border-purple-200 bg-white shadow-sm"
          />
        ) : (
          <CharacterCanvas selection={character} characterName={character.characterName} className="max-w-[240px]" />
        )}
        {character.isSample ? (
          <p className="text-xs text-slate-500 text-center">Sample character — build your own in step 1 anytime.</p>
        ) : null}
      </div>

      <p className="text-slate-500 text-sm text-center mb-4">
        Card {index + 1} of {prompts.length}
      </p>

      <div className="min-h-[100px] flex items-center justify-center rounded-xl bg-gradient-to-br from-purple-50 to-indigo-50 border border-purple-100 p-5 mb-5">
        <p className="text-lg sm:text-xl font-medium text-slate-800 text-center">{currentPrompt}</p>
      </div>

      <StudentSpeakingRecorder
        key={`char-story-${index}`}
        promptText={currentPrompt}
        promptId={`${activity.id}-card-${index}`}
        lessonId={lesson.id}
        activityType={activity.activity_type}
        minWords={10}
        maxRecordingSeconds={75}
        cefrLevel="A1"
        onBusyChange={handleBusyChange}
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
        {index + 1 < prompts.length && canGoNext && (
          <Button onClick={() => setIndex((i) => i + 1)}>Next card</Button>
        )}
        {canFinish && (
          <Button
            onClick={() => {
              if (!allCardsPassed(prompts.length, results)) return
              const { score, maxScore } = speakingCardsTotals(results, prompts.length)
              onComplete({
                score,
                maxScore,
                attempts: 1,
                answers: {
                  character,
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
