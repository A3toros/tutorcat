'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Play, Pause } from 'lucide-react'
import { Card, Button, Table, Header, Body, Row, Head, Cell, Input, Select } from '@/components/ui'
import { useNotification } from '@/contexts/NotificationContext'
import { adminApiRequest } from '@/utils/adminApi'
import { isAdminTtsCheckLessonId } from '@/lib/adminTtsCheckTopics'

interface RobotDetectItem {
  job_id: string
  user_id: string | null
  user_email: string | null
  user_username: string | null
  lesson_id: string | null
  student_lesson_number?: number | null
  student_lesson_topic?: string | null
  prompt: string | null
  prompt_id: string | null
  transcript: string
  status: string
  error: string | null
  created_at: string
  robotic_voice_score: number | null
  robotic_voice_would_flag: boolean | null
  robotic_voice_flagged: boolean | null
  robotic_voice_rules: string[] | null
  robotic_voice_detail?: Record<string, unknown> | null
  signals?: Record<string, unknown> | null
}

function scoreBadgeClass(score: number | null): string {
  if (score == null) return 'bg-slate-100 text-slate-600'
  if (score >= 75) return 'bg-red-100 text-red-800 font-bold'
  if (score >= 50) return 'bg-amber-100 text-amber-900 font-semibold'
  return 'bg-green-100 text-green-800'
}

function deliveryModeCell(signals: Record<string, unknown> | null | undefined): React.ReactNode {
  const mode = signals?.delivery_mode
  if (mode === 'reading') {
    return (
      <span className="font-bold text-red-600 text-base" title="Reading aloud">
        R
      </span>
    )
  }
  if (mode === 'speaking') {
    return (
      <span className="font-bold text-green-600 text-base" title="Speaking">
        S
      </span>
    )
  }
  if (mode === 'tts') {
    return (
      <span className="font-bold text-purple-700 text-base" title="TTS / robotic voice">
        T
      </span>
    )
  }
  return <span className="text-slate-400 text-sm">—</span>
}

export default function AdminRobotDetectPage() {
  const router = useRouter()
  const { showNotification } = useNotification()

  const [items, setItems] = useState<RobotDetectItem[]>([])
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [userSearch, setUserSearch] = useState('')
  const [viewFilter, setViewFilter] = useState<'all' | 'would_flag' | 'reading'>('all')
  const [onlyScored, setOnlyScored] = useState(true)
  const [minScore, setMinScore] = useState('0')
  // Default to newest-first so fresh recordings are visible (v2.2 often scores 0).
  const [sort, setSort] = useState('created_desc')
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null)
  const [playingJobId, setPlayingJobId] = useState<string | null>(null)
  const [loadingAudioJobId, setLoadingAudioJobId] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const loadItems = useCallback(async () => {
    setIsLoading(true)
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: '50',
        sort,
        onlyScored: String(onlyScored),
        viewFilter,
        minScore: minScore || '0',
      })
      if (userSearch.trim()) params.set('userSearch', userSearch.trim())

      const res = await adminApiRequest(`/.netlify/functions/admin-robot-detect?${params.toString()}`, {
        method: 'GET',
      })
      const data = await res.json()
      if (!data?.success) throw new Error(data?.error || 'Failed to load robot detect data')

      setItems(data.items || [])
      setTotalPages(data.pagination?.totalPages || 1)
      setTotal(data.pagination?.total || 0)
    } catch (e) {
      showNotification((e as Error).message || 'Failed to load', 'error')
    } finally {
      setIsLoading(false)
    }
  }, [page, sort, onlyScored, viewFilter, minScore, userSearch, showNotification])

  useEffect(() => {
    loadItems()
  }, [loadItems])

  const handlePlay = async (jobId: string) => {
    const audio = audioRef.current
    if (playingJobId === jobId && audio) {
      audio.pause()
      audio.src = ''
      setPlayingJobId(null)
      return
    }
    if (audio) {
      audio.pause()
      audio.src = ''
    }
    setLoadingAudioJobId(jobId)
    try {
      const res = await adminApiRequest(
        `/.netlify/functions/admin-get-speech-audio-url?jobId=${encodeURIComponent(jobId)}`,
        { method: 'GET' }
      )
      const data = await res.json()
      if (!data?.success || !data?.url) throw new Error(data?.error || 'Audio not found')
      if (!audio) return
      audio.src = data.url
      await audio.play()
      setPlayingJobId(jobId)
    } catch (e) {
      showNotification((e as Error).message || 'Playback failed', 'error')
      setPlayingJobId(null)
    } finally {
      setLoadingAudioJobId(null)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-purple-50 p-6">
      <audio ref={audioRef} className="hidden" onEnded={() => setPlayingJobId(null)} />
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center space-x-4">
            <Button variant="secondary" size="sm" onClick={() => router.push('/admin/dashboard')}>
              ← Dashboard
            </Button>
            <Button variant="secondary" size="sm" onClick={() => router.push('/admin/transcripts')}>
              Transcripts
            </Button>
            <Button variant="primary" size="sm" onClick={() => router.push('/admin/robot-detect/check-tts')}>
              Check TTS
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-slate-800">Robot Detect</h1>
              <p className="text-slate-600 text-sm">
                Speech submissions with robotic / TTS voice scores (log mode — not blocking students).
              </p>
            </div>
          </div>
        </div>

        <Card className="border-purple-200 shadow-lg bg-white">
          <Card.Header>
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
              <div className="flex flex-wrap items-center gap-3">
                <Input
                  placeholder="Student email or ID"
                  value={userSearch}
                  onChange={(e) => {
                    setUserSearch(e.target.value)
                    setPage(1)
                  }}
                  className="w-48"
                />
                <Select
                  value={viewFilter}
                  onChange={(e) => {
                    const next = e.target.value as 'all' | 'would_flag' | 'reading'
                    setViewFilter(next)
                    if (next === 'reading') setOnlyScored(false)
                    setPage(1)
                  }}
                  className="w-44"
                >
                  <option value="all">All scores</option>
                  <option value="would_flag">Would flag only</option>
                  <option value="reading">Reading only</option>
                </Select>
                <Select
                  value={onlyScored ? 'scored' : 'all'}
                  onChange={(e) => {
                    setOnlyScored(e.target.value === 'scored')
                    setPage(1)
                  }}
                  className="w-44"
                >
                  <option value="scored">Scored only</option>
                  <option value="all">All submissions</option>
                </Select>
                <Select
                  value={minScore}
                  onChange={(e) => {
                    setMinScore(e.target.value)
                    setPage(1)
                  }}
                  className="w-36"
                >
                  <option value="0">Min score: 0</option>
                  <option value="50">Min score: 50</option>
                  <option value="75">Min score: 75</option>
                </Select>
                <Select
                  value={sort}
                  onChange={(e) => {
                    setSort(e.target.value)
                    setPage(1)
                  }}
                  className="w-40"
                >
                  <option value="score_desc">Score ↓</option>
                  <option value="score_asc">Score ↑</option>
                  <option value="created_desc">Newest</option>
                </Select>
              </div>
              <div className="flex items-center gap-3 text-sm text-slate-600">
                <span>
                  {total} total · page {page}/{totalPages}
                </span>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page <= 1 || isLoading}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Prev
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page >= totalPages || isLoading}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          </Card.Header>

          <Card.Body>
            {isLoading ? (
              <div className="py-10 text-center text-slate-600">Loading…</div>
            ) : items.length === 0 ? (
              <div className="py-10 text-center text-slate-600">
                No submissions match. Run migration{' '}
                <code className="text-xs bg-slate-100 px-1 rounded">20260605000000_speech_jobs_robotic_voice_columns.sql</code>{' '}
                and record new speaking attempts to populate scores.
              </div>
            ) : (
              <Table>
                <Header>
                  <Row>
                    <Head>Score</Head>
                    <Head title="Reading (R) or Speaking (S)">R/S</Head>
                    <Head>Would flag</Head>
                    <Head>Student</Head>
                    <Head>Lesson</Head>
                    <Head>Status</Head>
                    <Head>Rules</Head>
                    <Head>Created</Head>
                    <Head>Audio</Head>
                  </Row>
                </Header>
                <Body>
                  {items.map((item) => {
                    const userLabel =
                      item.user_username || item.user_email || item.user_id?.slice(0, 8) || '—'
                    const lessonLabel =
                      isAdminTtsCheckLessonId(item.lesson_id)
                        ? 'TTS Check (admin)'
                        : item.student_lesson_number != null && item.student_lesson_topic
                          ? `L${item.student_lesson_number}: ${item.student_lesson_topic}`
                          : item.lesson_id || '—'
                    const rules = Array.isArray(item.robotic_voice_rules) ? item.robotic_voice_rules : []
                    const expanded = expandedJobId === item.job_id

                    return (
                      <React.Fragment key={item.job_id}>
                        <Row
                          className={
                            item.robotic_voice_would_flag
                              ? 'bg-red-50/60'
                              : item.robotic_voice_score != null && item.robotic_voice_score >= 50
                                ? 'bg-amber-50/40'
                                : undefined
                          }
                        >
                          <Cell>
                            <span
                              className={`inline-block min-w-[2.5rem] text-center px-2 py-0.5 rounded text-sm ${scoreBadgeClass(item.robotic_voice_score)}`}
                            >
                              {item.robotic_voice_score ?? '—'}
                            </span>
                          </Cell>
                          <Cell className="text-center">{deliveryModeCell(item.signals)}</Cell>
                          <Cell>
                            {item.robotic_voice_would_flag ? (
                              <span className="text-red-700 font-semibold text-sm">Yes</span>
                            ) : item.robotic_voice_score != null ? (
                              <span className="text-slate-500 text-sm">No</span>
                            ) : (
                              '—'
                            )}
                          </Cell>
                          <Cell className="text-sm">{userLabel}</Cell>
                          <Cell className="text-sm max-w-[10rem] truncate" title={lessonLabel}>
                            {lessonLabel}
                          </Cell>
                          <Cell className="text-sm">{item.status}</Cell>
                          <Cell className="text-xs text-slate-600 max-w-[12rem]">
                            {rules.length ? rules.join(', ') : '—'}
                          </Cell>
                          <Cell className="text-xs text-slate-500 whitespace-nowrap">
                            {new Date(item.created_at).toLocaleString()}
                          </Cell>
                          <Cell>
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                disabled={loadingAudioJobId === item.job_id}
                                onClick={() => handlePlay(item.job_id)}
                              >
                                {playingJobId === item.job_id ? (
                                  <Pause className="w-4 h-4" />
                                ) : (
                                  <Play className="w-4 h-4" />
                                )}
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() =>
                                  setExpandedJobId(expanded ? null : item.job_id)
                                }
                              >
                                {expanded ? 'Hide' : 'Detail'}
                              </Button>
                            </div>
                          </Cell>
                        </Row>
                        {expanded && (
                          <Row>
                            <Cell colSpan={9} className="bg-slate-50 text-sm">
                              <p className="font-semibold text-slate-700 mb-1">Prompt</p>
                              <p className="text-slate-600 mb-3">{item.prompt || '—'}</p>
                              <p className="font-semibold text-slate-700 mb-1">Transcript</p>
                              <p className="text-slate-600 italic mb-3">
                                &ldquo;{item.transcript || '—'}&rdquo;
                              </p>
                              {(item.signals || item.robotic_voice_detail) && (
                                <>
                                  <p className="font-semibold text-slate-700 mb-1">
                                    Signals{' '}
                                    <span className="text-xs font-normal text-slate-500">
                                      (
                                      {String(
                                        (item.signals as { scorer_version?: string } | null)
                                          ?.scorer_version || 'v1 legacy'
                                      )}
                                      )
                                    </span>
                                  </p>
                                  <pre className="text-xs bg-white border border-slate-200 rounded p-2 overflow-x-auto">
                                    {JSON.stringify(
                                      item.signals ??
                                        (item.robotic_voice_detail as { signals?: unknown }).signals ??
                                        item.robotic_voice_detail,
                                      null,
                                      2
                                    )}
                                  </pre>
                                </>
                              )}
                              <p className="text-xs text-slate-400 mt-2 font-mono">{item.job_id}</p>
                            </Cell>
                          </Row>
                        )}
                      </React.Fragment>
                    )
                  })}
                </Body>
              </Table>
            )}
          </Card.Body>
        </Card>
      </div>
    </div>
  )
}
