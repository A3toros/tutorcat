'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Card, Button, Table, Header, Body, Row, Head, Cell, Input, Select } from '@/components/ui'
import { useNotification } from '@/contexts/NotificationContext'
import { adminApiRequest } from '@/utils/adminApi'

interface IntegritySignals {
  level_mismatch?: number
  off_syllabus_vocab?: number
  robotic_cues?: number
  [key: string]: any
}

interface Integrity {
  risk_score?: number
  flagged?: boolean
  message?: string
  signals?: IntegritySignals
  [key: string]: any
}

interface TranscriptItem {
  job_id: string
  user_id: string | null
  user_email: string | null
  lesson_id: string | null
  prompt: string | null
  prompt_id: string | null
  transcript: string
  status: string
  error: string | null
  integrity: Integrity | null
  created_at: string
  lesson_result?: any
}

export default function AdminTranscriptsPage() {
  const router = useRouter()
  const { showNotification } = useNotification()

  const [items, setItems] = useState<TranscriptItem[]>([])
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [isLoading, setIsLoading] = useState(false)
  const [onlyFlagged, setOnlyFlagged] = useState(false)
  const [lessonFilter, setLessonFilter] = useState('')
  const [expandedJobs, setExpandedJobs] = useState<Set<string>>(new Set())
  const [expandedActivities, setExpandedActivities] = useState<Set<string>>(new Set())

  const loadTranscripts = useCallback(async () => {
    try {
      setIsLoading(true)

      const params = new URLSearchParams()
      params.set('scope', 'lessons')
      params.set('page', String(page))
      params.set('limit', '50')
      if (lessonFilter.trim()) {
        params.set('lessonId', lessonFilter.trim())
      }

      const response = await adminApiRequest(`/.netlify/functions/admin-speaking-flags?${params.toString()}`, {
        method: 'GET'
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(errorText || `HTTP error! status: ${response.status}`)
      }

      const result = await response.json()
      if (!result.success) {
        throw new Error(result.error || 'Failed to load transcripts')
      }

      const rawItems: TranscriptItem[] = result.items || []
      const filtered = onlyFlagged
        ? rawItems.filter((item) => item.integrity?.flagged)
        : rawItems

      setItems(filtered)
      if (result.pagination) {
        setTotalPages(result.pagination.totalPages || 1)
      }
    } catch (error) {
      console.error('Failed to load transcripts:', error)
      showNotification('Failed to load transcripts: ' + (error as Error).message, 'error')
      setItems([])
    } finally {
      setIsLoading(false)
    }
  }, [page, lessonFilter, onlyFlagged, showNotification])

  useEffect(() => {
    loadTranscripts()
  }, [loadTranscripts])

  const toggleExpanded = (jobId: string) => {
    setExpandedJobs(prev => {
      const next = new Set(prev)
      if (next.has(jobId)) next.delete(jobId)
      else next.add(jobId)
      return next
    })
  }

  const toggleActivityExpanded = (jobId: string) => {
    setExpandedActivities(prev => {
      const next = new Set(prev)
      if (next.has(jobId)) next.delete(jobId)
      else next.add(jobId)
      return next
    })
  }

  const formatDate = (value: string) => {
    if (!value) return ''
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return value
    // Adjust by +7 hours for display (e.g. local timezone offset)
    const adjusted = new Date(d.getTime() + 7 * 60 * 60 * 1000)
    return adjusted.toLocaleString()
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-purple-50 p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Button variant="secondary" size="sm" onClick={() => router.push('/admin/dashboard')}>
              ← Back to Dashboard
            </Button>
            <Button variant="secondary" size="sm" onClick={() => router.push('/admin/improve-transcript-test')}>
              Test
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-slate-800">Speaking Transcripts</h1>
              <p className="text-slate-600 text-sm">
                View recent speech jobs with AI integrity flags.
              </p>
            </div>
          </div>
        </div>

        <Card className="border-purple-200 shadow-lg bg-white">
          <Card.Header>
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div className="flex items-center space-x-3">
                <Input
                  placeholder="Filter by lesson id (e.g. A1-L91)"
                  value={lessonFilter}
                  onChange={(e) => {
                    setLessonFilter(e.target.value)
                    setPage(1)
                  }}
                  className="w-56"
                />
                <Select
                  value={onlyFlagged ? 'flagged' : 'all'}
                  onChange={(e) => {
                    setOnlyFlagged(e.target.value === 'flagged')
                    setPage(1)
                  }}
                  className="w-40"
                >
                  <option value="all">All transcripts</option>
                  <option value="flagged">Only flagged</option>
                </Select>
              </div>

              <div className="flex items-center space-x-3">
                <span className="text-sm text-slate-600">
                  Page {page} of {totalPages}
                </span>
                <div className="flex space-x-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={page <= 1 || isLoading}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={page >= totalPages || isLoading}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </div>
          </Card.Header>

          <Card.Body>
            {isLoading ? (
              <div className="py-10 text-center text-slate-600">
                Loading transcripts...
              </div>
            ) : items.length === 0 ? (
              <div className="py-10 text-center text-slate-600">
                No transcripts found for the current filters.
              </div>
            ) : (
              <Table>
                <Header>
                  <Row>
                    <Head>User</Head>
                    <Head>Lesson</Head>
                    <Head>Prompt</Head>
                    <Head>Status</Head>
                    <Head>Risk</Head>
                    <Head>Flagged</Head>
                    <Head>Created</Head>
                    <Head>Activity</Head>
                    <Head>Actions</Head>
                  </Row>
                </Header>
                <Body>
                  {items.map((item) => {
                    const integrity = item.integrity || {}
                    const risk = typeof integrity.risk_score === 'number' ? integrity.risk_score : 0
                    const flagged = Boolean(integrity.flagged)
                    const isExpanded = expandedJobs.has(item.job_id)
                    const isActivityExpanded = expandedActivities.has(item.job_id)

                    const rawPrompt = item.prompt || ''
                    let lessonLabel = item.lesson_id || item.prompt_id || ''
                    let promptLabel = rawPrompt

                    if (!lessonLabel && rawPrompt) {
                      const [first, ...rest] = rawPrompt.split(' ')
                      if (rest.length > 0) {
                        lessonLabel = first
                        promptLabel = rest.join(' ')
                      }
                    }

                    return (
                      <React.Fragment key={item.job_id}>
                        <Row
                          className={
                            flagged
                              ? 'bg-red-50 border-l-4 border-red-400'
                              : 'hover:bg-slate-50'
                          }
                        >
                          <Cell className="text-xs text-slate-700">
                            {item.user_email || item.user_id || '—'}
                          </Cell>
                          <Cell className="text-xs text-slate-700">
                            {lessonLabel || '—'}
                          </Cell>
                          <Cell className="text-xs text-slate-700 max-w-sm truncate">
                            {promptLabel || '—'}
                          </Cell>
                          <Cell className="text-xs">
                            <span
                              className={
                                item.status === 'completed'
                                  ? 'text-green-700'
                                  : item.status === 'failed'
                                  ? 'text-red-700'
                                  : 'text-amber-700'
                              }
                            >
                              {item.status}
                            </span>
                          </Cell>
                          <Cell className="text-xs">
                            {risk > 0 ? (
                              <span
                                className={
                                  risk >= 50
                                    ? 'px-2 py-1 rounded-full bg-red-100 text-red-800 text-xs font-semibold'
                                    : risk >= 40
                                    ? 'px-2 py-1 rounded-full bg-amber-100 text-amber-800 text-xs font-semibold'
                                    : 'px-2 py-1 rounded-full bg-green-100 text-green-800 text-xs font-semibold'
                                }
                              >
                                {risk}
                              </span>
                            ) : (
                              <span className="text-slate-400 text-xs">—</span>
                            )}
                          </Cell>
                          <Cell className="text-xs">
                            {flagged ? (
                              <span className="text-red-700 font-semibold">Yes</span>
                            ) : (
                              <span className="text-slate-500">No</span>
                            )}
                          </Cell>
                          <Cell className="text-xs text-slate-600">
                            {formatDate(item.created_at)}
                          </Cell>
                          <Cell className="text-xs">
                            {item.lesson_result ? (
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => toggleActivityExpanded(item.job_id)}
                              >
                                {isActivityExpanded ? 'Hide' : 'View'}
                              </Button>
                            ) : (
                              <span className="text-slate-400 text-xs">—</span>
                            )}
                          </Cell>
                          <Cell className="text-xs">
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => toggleExpanded(item.job_id)}
                            >
                              {isExpanded ? 'Hide' : 'View'}
                            </Button>
                          </Cell>
                        </Row>
                        {isExpanded && (
                          <Row>
                            <Cell colSpan={9}>
                              <div className="p-4 bg-slate-50 rounded-md space-y-3 text-xs text-slate-800">
                                {item.status === 'failed' && item.error && (
                                  <div>
                                    <div className="font-semibold mb-1 text-red-700">Error:</div>
                                    <div className="whitespace-pre-wrap text-red-800">
                                      {item.error}
                                    </div>
                                  </div>
                                )}
                                <div>
                                  <div className="font-semibold mb-1">Transcript</div>
                                  <div className="whitespace-pre-wrap">
                                    {item.transcript || '(empty)'}
                                  </div>
                                </div>
                                {integrity && (
                                  <div className="space-y-1">
                                    <div className="font-semibold mb-1">AI Integrity</div>
                                    <div className="flex flex-wrap items-center gap-3">
                                      <span className="text-xs">
                                        <span className="font-semibold">Flagged:</span>{' '}
                                        {flagged ? (
                                          <span className="text-red-700 font-semibold">Yes</span>
                                        ) : (
                                          <span className="text-slate-600">No</span>
                                        )}
                                      </span>
                                      <span className="text-xs">
                                        <span className="font-semibold">Risk score:</span>{' '}
                                        {typeof integrity.risk_score === 'number'
                                          ? integrity.risk_score
                                          : '—'}
                                      </span>
                                    </div>
                                    {integrity.signals && (
                                      <div className="text-xs text-slate-700">
                                        <div className="font-semibold">Signals:</div>
                                        <ul className="list-disc list-inside space-y-0.5">
                                          {typeof integrity.signals.robotic_cues === 'number' && (
                                            <li>
                                              Robotic cues: {integrity.signals.robotic_cues}
                                            </li>
                                          )}
                                          {typeof integrity.signals.level_mismatch === 'number' && (
                                            <li>
                                              Level mismatch: {integrity.signals.level_mismatch}
                                            </li>
                                          )}
                                          {typeof integrity.signals.off_syllabus_vocab === 'number' && (
                                            <li>
                                              Off‑syllabus vocabulary:{' '}
                                              {integrity.signals.off_syllabus_vocab}
                                            </li>
                                          )}
                                        </ul>
                                      </div>
                                    )}
                                    {flagged && integrity.message && (
                                      <div className="text-xs text-red-700 mt-1">
                                        {integrity.message}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            </Cell>
                          </Row>
                        )}
                        {isActivityExpanded && (
                          <Row>
                            <Cell colSpan={9}>
                              <div className="p-4 bg-slate-50 rounded-md space-y-3 text-xs text-slate-800">
                                <div>
                                  <div className="font-semibold mb-1">Activity (lesson result)</div>
                                  {item.lesson_result ? (
                                    <div className="space-y-1 text-xs text-slate-700">
                                      <div>
                                        <span className="font-semibold">Type:</span>{' '}
                                        {item.lesson_result.activity_type || '—'}
                                      </div>
                                      <div>
                                        <span className="font-semibold">Order:</span>{' '}
                                        {typeof item.lesson_result.activity_order === 'number'
                                          ? item.lesson_result.activity_order
                                          : '—'}
                                      </div>
                                      <div>
                                        <span className="font-semibold">Completed at:</span>{' '}
                                        {item.lesson_result.completed_at
                                          ? formatDate(item.lesson_result.completed_at)
                                          : '—'}
                                      </div>
                                      <div>
                                        <span className="font-semibold">Score:</span>{' '}
                                        {typeof item.lesson_result.score === 'number'
                                          ? `${item.lesson_result.score}/${item.lesson_result.max_score ?? '—'}`
                                          : '—'}
                                      </div>
                                      {item.lesson_result.answers && (
                                        <div className="mt-1">
                                          <div className="font-semibold">Answer text</div>
                                          <div className="whitespace-pre-wrap text-slate-800">
                                            {typeof item.lesson_result.answers.transcript === 'string'
                                              ? item.lesson_result.answers.transcript
                                              : typeof item.lesson_result.answers.text === 'string'
                                              ? item.lesson_result.answers.text
                                              : JSON.stringify(item.lesson_result.answers, null, 2)}
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  ) : (
                                    <div className="text-xs text-slate-700">
                                      No entries in lesson_activity_results for this user + lesson
                                    </div>
                                  )}
                                </div>
                              </div>
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

