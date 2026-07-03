'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import AdminProtectedRoute from '@/components/auth/AdminProtectedRoute'
import SpeakingWithFeedback from '@/components/lesson/activities/SpeakingWithFeedback'
import { Button, Card, Select } from '@/components/ui'
import { useNotification } from '@/contexts/NotificationContext'
import { useAuth } from '@/contexts/AuthContext'
import { adminApiRequest } from '@/utils/adminApi'
import {
  ADMIN_TTS_CHECK_TOPICS,
  ADMIN_TTS_DELIVERY_OPTIONS,
  type AdminTtsDeliveryMethod,
  adminTtsCheckLessonId,
  buildPromptsForTopic,
  getTopicById,
} from '@/lib/adminTtsCheckTopics'

type SessionRow = {
  id: string
  topic_title: string
  delivery_method: string
  created_at: string
  job_ids: string[]
  jobs?: Array<{
    job_id: string
    robotic_voice_score: number | null
    robotic_voice_would_flag: boolean | null
    robotic_voice_rules: string[] | null
    scorer_version: string | null
    score_skip_reason: string | null
    logprob_is_artifact: boolean | null
    status: string
    prompt: string | null
    prompt_id: string | null
  }> | null
}

type Phase = 'setup' | 'recording' | 'done'

function deliveryLabel(method: string): string {
  return ADMIN_TTS_DELIVERY_OPTIONS.find((o) => o.value === method)?.label || method
}

function scoreHint(job: NonNullable<SessionRow['jobs']>[number]): string | null {
  if (job.robotic_voice_score == null) return null
  if (job.robotic_voice_score >= 55) return null
  const rules = Array.isArray(job.robotic_voice_rules) ? job.robotic_voice_rules.join(', ') : ''
  if (job.scorer_version === 'v2.2.1' && job.logprob_is_artifact) {
    return 'v2.2.1 skipped TTS — re-record after deploy for v2.3 scoring'
  }
  if (job.score_skip_reason && job.robotic_voice_score === 0) {
    return `skip: ${job.score_skip_reason}`
  }
  if (rules) return `rules: ${rules}`
  if (job.logprob_is_artifact) return 'flat logprob but below v2.3 TTS threshold (need ≥5 segments, ≥15 words)'
  return 'no rules fired'
}

const DEFAULT_TOPIC_ID = ADMIN_TTS_CHECK_TOPICS[0]?.id ?? 'family-home'

export default function AdminCheckTtsPage() {
  const router = useRouter()
  const { showNotification } = useNotification()
  const { user } = useAuth()

  const [phase, setPhase] = useState<Phase>('setup')
  const [topicId, setTopicId] = useState(DEFAULT_TOPIC_ID)
  const [sessionId, setSessionId] = useState(() => crypto.randomUUID())
  const [deliveryMethod, setDeliveryMethod] = useState<AdminTtsDeliveryMethod>('human_mic')
  const [notes, setNotes] = useState('')
  const [sessions, setSessions] = useState<SessionRow[]>([])
  const [isSaving, setIsSaving] = useState(false)
  const [isLoadingSessions, setIsLoadingSessions] = useState(false)

  const sessionLessonId = useMemo(() => adminTtsCheckLessonId(sessionId), [sessionId])

  const topic = useMemo(() => getTopicById(topicId) ?? ADMIN_TTS_CHECK_TOPICS[0], [topicId])
  const prompts = useMemo(() => buildPromptsForTopic(topic), [topic])

  const loadSessions = useCallback(async () => {
    setIsLoadingSessions(true)
    try {
      const res = await adminApiRequest('/.netlify/functions/admin-tts-check-session?limit=15', {
        method: 'GET',
      })
      const data = await res.json()
      if (!data?.success) throw new Error(data?.error || 'Failed to load sessions')
      setSessions(data.sessions || [])
    } catch (e) {
      showNotification((e as Error).message || 'Failed to load sessions', 'error')
    } finally {
      setIsLoadingSessions(false)
    }
  }, [showNotification])

  useEffect(() => {
    loadSessions()
  }, [loadSessions])

  const lessonData = useMemo(
    () => ({
      lessonId: sessionLessonId,
      activityOrder: 1,
      level: 'A1',
      prompts,
      feedbackCriteria: {
        grammar: true,
        vocabulary: true,
        pronunciation: true,
      },
    }),
    [prompts, sessionLessonId]
  )

  const handleSpeakingComplete = useCallback(
    async (result?: {
      transcripts?: Record<string, string>
      feedback?: Record<string, unknown>
      jobIds?: Record<string, string>
    }) => {
      const jobIds = [...new Set(Object.values(result?.jobIds || {}).filter(Boolean))]

      if (jobIds.length === 0) {
        showNotification('No speech jobs recorded', 'error')
        setPhase('setup')
        return
      }

      setIsSaving(true)
      try {
        const res = await adminApiRequest('/.netlify/functions/admin-tts-check-session', {
          method: 'POST',
          body: JSON.stringify({
            topic_id: topic.id,
            topic_title: topic.title,
            delivery_method: deliveryMethod,
            job_ids: jobIds,
            transcripts: result?.transcripts || {},
            feedback: result?.feedback || {},
            notes: notes.trim() || undefined,
            admin_user_id: user?.id,
          }),
        })
        const data = await res.json()
        if (!data?.success) throw new Error(data?.error || 'Failed to save session')

        showNotification('TTS check session saved — robotic scores will appear in Robot Detect shortly.', 'success')
        setPhase('done')
        await loadSessions()
      } catch (e) {
        showNotification((e as Error).message || 'Failed to save session', 'error')
        setPhase('setup')
      } finally {
        setIsSaving(false)
      }
    },
    [topic, deliveryMethod, notes, user?.id, showNotification, loadSessions]
  )

  const startSession = () => {
    setSessionId(crypto.randomUUID())
    setPhase('recording')
  }

  const resetForAnother = () => {
    setSessionId(crypto.randomUUID())
    setPhase('setup')
    setNotes('')
  }

  if (!user) {
    return (
      <AdminProtectedRoute>
        <div className="min-h-screen bg-slate-900 flex items-center justify-center text-white">
          Loading admin user…
        </div>
      </AdminProtectedRoute>
    )
  }

  return (
    <AdminProtectedRoute>
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-purple-50 p-6">
        <div className="max-w-5xl mx-auto space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Button variant="secondary" size="sm" onClick={() => router.push('/admin/robot-detect')}>
                ← Robot Detect
              </Button>
              <div>
                <h1 className="text-2xl font-bold text-slate-800">Check TTS</h1>
                <p className="text-slate-600 text-sm">
                  Record labeled samples through the same speaking pipeline students use. Data appears in Robot Detect.
                </p>
              </div>
            </div>
          </div>

          {phase === 'setup' && (
            <Card className="border-purple-200 shadow-lg bg-white">
              <Card.Header>
                <h2 className="text-lg font-semibold text-slate-800">Session setup</h2>
              </Card.Header>
              <Card.Body className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Topic</label>
                  <Select
                    value={topicId}
                    onChange={(e) => setTopicId(e.target.value)}
                    className="w-full max-w-md"
                  >
                    {ADMIN_TTS_CHECK_TOPICS.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.title}
                      </option>
                    ))}
                  </Select>
                  <ol className="list-decimal list-inside text-slate-600 space-y-1 text-sm mt-3">
                    {prompts.map((p) => (
                      <li key={p.id}>{p.text}</li>
                    ))}
                  </ol>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    How are you producing the audio?
                  </label>
                  <Select
                    value={deliveryMethod}
                    onChange={(e) => setDeliveryMethod(e.target.value as AdminTtsDeliveryMethod)}
                    className="w-full max-w-md"
                  >
                    {ADMIN_TTS_DELIVERY_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </Select>
                  <p className="text-xs text-slate-500 mt-2">
                    Label honestly — this metadata is stored with speech jobs for threshold tuning.
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Notes (optional)</label>
                  <textarea
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm min-h-[4rem]"
                    placeholder="e.g. iPhone speaker at 50% volume, 20cm from mic"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </div>

                <Button onClick={startSession} disabled={prompts.length === 0}>
                  Start speaking session
                </Button>
              </Card.Body>
            </Card>
          )}

          {phase === 'recording' && (
            <Card className="border-purple-200 shadow-lg bg-white overflow-hidden">
              <Card.Header>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-800">{topic.title}</h2>
                    <p className="text-sm text-slate-600">{deliveryLabel(deliveryMethod)}</p>
                  </div>
                  <Button variant="secondary" size="sm" onClick={() => setPhase('setup')}>
                    Cancel
                  </Button>
                </div>
              </Card.Header>
              <Card.Body>
                <SpeakingWithFeedback
                  key={sessionLessonId}
                  lessonData={lessonData}
                  adminCalibrationMode
                  onComplete={handleSpeakingComplete}
                />
              </Card.Body>
            </Card>
          )}

          {phase === 'done' && (
            <Card className="border-green-200 bg-green-50/50">
              <Card.Body className="space-y-4">
                <p className="text-slate-800 font-medium">Session saved.</p>
                <p className="text-sm text-slate-600">
                  Robotic voice scores are computed in the background. Refresh Robot Detect in a minute to see results
                  (filter by your admin email; lesson id starts with{' '}
                  <code className="text-xs bg-white px-1 rounded">admin-tts-check</code>).
                </p>
                <p className="text-sm text-slate-500">
                  Scorer v2.3.3 is calibrated on your ChatGPT TTS samples (single-segment + ultra-flat
                  pitch). Re-record after deploy — v2.3.1 jobs keep old scores.
                </p>
                <div className="flex gap-2">
                  <Button onClick={resetForAnother}>Another session</Button>
                  <Button variant="secondary" onClick={() => router.push('/admin/robot-detect')}>
                    View Robot Detect
                  </Button>
                </div>
              </Card.Body>
            </Card>
          )}

          {isSaving && (
            <div className="text-center text-slate-600 text-sm">Saving session…</div>
          )}

          <Card className="border-slate-200 bg-white">
            <Card.Header>
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-lg font-semibold text-slate-800">Recent calibration sessions</h2>
                <Button variant="ghost" size="sm" disabled={isLoadingSessions} onClick={loadSessions}>
                  Refresh
                </Button>
              </div>
            </Card.Header>
            <Card.Body>
              {isLoadingSessions ? (
                <p className="text-slate-600 text-sm">Loading…</p>
              ) : sessions.length === 0 ? (
                <p className="text-slate-600 text-sm">No sessions yet.</p>
              ) : (
                <ul className="space-y-4">
                  {sessions.map((s) => (
                    <li key={s.id} className="border border-slate-100 rounded-lg p-3 text-sm">
                      <div className="flex flex-wrap justify-between gap-2 mb-2">
                        <span className="font-medium text-slate-800">{s.topic_title}</span>
                        <span className="text-slate-500">{new Date(s.created_at).toLocaleString()}</span>
                      </div>
                      <p className="text-slate-600 mb-2">{deliveryLabel(s.delivery_method)}</p>
                      {Array.isArray(s.jobs) && s.jobs.length > 0 ? (
                        <ul className="space-y-2 text-xs text-slate-600">
                          {s.jobs.map((j) => {
                            const hint = scoreHint(j)
                            return (
                              <li key={j.job_id} className="border-t border-slate-100 pt-2 first:border-0 first:pt-0">
                                <div className="flex flex-wrap gap-2 items-center">
                                  <span
                                    className={
                                      j.robotic_voice_score != null && j.robotic_voice_score >= 50
                                        ? 'text-amber-800 font-semibold'
                                        : ''
                                    }
                                  >
                                    Score {j.robotic_voice_score ?? '…'}
                                  </span>
                                  {j.scorer_version ? (
                                    <span className="text-slate-400">{j.scorer_version}</span>
                                  ) : null}
                                  {j.robotic_voice_would_flag ? (
                                    <span className="text-red-700">would flag</span>
                                  ) : null}
                                </div>
                                <p className="text-slate-700 mt-0.5">{j.prompt}</p>
                                {hint ? <p className="text-slate-400 mt-0.5 italic">{hint}</p> : null}
                              </li>
                            )
                          })}
                        </ul>
                      ) : (
                        <p className="text-xs text-slate-400">Scores pending…</p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Card.Body>
          </Card>
        </div>
      </div>
    </AdminProtectedRoute>
  )
}
