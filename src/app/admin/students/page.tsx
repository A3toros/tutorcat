'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import AdminProtectedRoute from '@/components/auth/AdminProtectedRoute'
import { Button, Card, Table, Header, Body, Row, Head, Cell } from '@/components/ui'
import { useNotification } from '@/contexts/NotificationContext'
import { adminApiRequest } from '@/utils/adminApi'

type StudentLessonScore = {
  lesson_id: string
  lesson_number: number
  topic: string
  lesson_active?: boolean
  score_percentage: number
  completed?: boolean
  activities_done: number
  activities_total: number
  completed_at?: string | null
}

type StudentTrackLesson = {
  id: string
  lesson_number: number
  topic: string
  slug: string | null
  active: boolean
  activity_count: number
}

type AdminStudent = {
  id: string
  school_student_id: string | null
  nickname: string
  class: '1/15' | '1/16' | null
  speech_jobs: number
  lessons: StudentLessonScore[]
}

type TranscriptItem = {
  job_id: string
  prompt: string | null
  prompt_id: string | null
  created_at: string
  transcript: string
  status: string
}

function bySchoolId(a: AdminStudent, b: AdminStudent) {
  return String(a.school_student_id || '').localeCompare(String(b.school_student_id || ''))
}

export default function AdminStudentsPage() {
  const router = useRouter()
  const { showNotification } = useNotification()

  const [students, setStudents] = useState<AdminStudent[]>([])
  const [trackLessons, setTrackLessons] = useState<StudentTrackLesson[]>([])
  const [loadingLessons, setLoadingLessons] = useState(true)
  const [togglingLessonId, setTogglingLessonId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [expandedLessons, setExpandedLessons] = useState<Set<string>>(new Set())
  const [loadingTranscriptsFor, setLoadingTranscriptsFor] = useState<string | null>(null)
  const [transcriptsByStudent, setTranscriptsByStudent] = useState<Record<string, TranscriptItem[]>>({})
  const [audioUrlByJob, setAudioUrlByJob] = useState<Record<string, string>>({})
  const [loadingAudioJob, setLoadingAudioJob] = useState<string | null>(null)

  const loadTrackLessons = useCallback(async () => {
    try {
      setLoadingLessons(true)
      const res = await adminApiRequest('/.netlify/functions/admin-student-lessons', { method: 'GET' })
      const data = await res.json()
      if (!data?.success) throw new Error(data?.error || 'Failed to load lessons')
      setTrackLessons(Array.isArray(data.lessons) ? data.lessons : [])
    } catch (e) {
      showNotification((e as Error).message || 'Failed to load student lessons', 'error')
      setTrackLessons([])
    } finally {
      setLoadingLessons(false)
    }
  }, [showNotification])

  const load = useCallback(async () => {
    try {
      setLoading(true)
      const res = await adminApiRequest('/.netlify/functions/admin-get-students', { method: 'GET' })
      const data = await res.json()
      if (!data?.success) throw new Error(data?.error || 'Failed to load students')
      setStudents(Array.isArray(data.students) ? data.students : [])
    } catch (e) {
      showNotification((e as Error).message || 'Failed to load students', 'error')
      setStudents([])
    } finally {
      setLoading(false)
    }
  }, [showNotification])

  useEffect(() => {
    load()
    loadTrackLessons()
  }, [load, loadTrackLessons])

  const toggleLessonActive = async (lesson: StudentTrackLesson) => {
    const nextActive = !lesson.active
    setTogglingLessonId(lesson.id)
    try {
      const res = await adminApiRequest('/.netlify/functions/admin-student-lessons', {
        method: 'PATCH',
        body: JSON.stringify({ lessonId: lesson.id, active: nextActive }),
      })
      const data = await res.json()
      if (!data?.success) throw new Error(data?.error || 'Failed to update lesson')
      const updated = data.lesson as StudentTrackLesson
      setTrackLessons((prev) =>
        prev.map((l) => (l.id === lesson.id ? { ...l, ...updated, activity_count: l.activity_count } : l))
      )
      showNotification(
        nextActive ? `Lesson ${lesson.lesson_number} is now visible to students.` : `Lesson ${lesson.lesson_number} hidden from students.`,
        'success'
      )
    } catch (e) {
      showNotification((e as Error).message || 'Failed to update lesson', 'error')
    } finally {
      setTogglingLessonId(null)
    }
  }

  const class115 = useMemo(() => students.filter((s) => s.class === '1/15').sort(bySchoolId), [students])
  const class116 = useMemo(() => students.filter((s) => s.class === '1/16').sort(bySchoolId), [students])

  const lessonKey = (studentId: string, lessonId: string) => `${studentId}:${lessonId}`

  const toggleExpanded = (student: AdminStudent) => {
    const studentId = student.id
    setExpanded((prev) => {
      const next = new Set(prev)
      const opening = !next.has(studentId)
      if (opening) {
        next.add(studentId)
        loadTranscripts(student)
      } else {
        next.delete(studentId)
      }
      return next
    })
  }

  const toggleLesson = (studentId: string, lessonId: string) => {
    const key = lessonKey(studentId, lessonId)
    setExpandedLessons((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const lessonSummary = (s: AdminStudent) => {
    const lessons = s.lessons || []
    const passed = lessons.filter((l) => l.completed).length
    const inProgress = lessons.filter((l) => !l.completed && l.activities_done > 0).length
    if (!lessons.length) return '—'
    const parts: string[] = []
    if (passed) parts.push(`${passed} passed`)
    if (inProgress) parts.push(`${inProgress} in progress`)
    if (!parts.length) parts.push('not started')
    return parts.join(', ')
  }

  const loadTranscripts = useCallback(
    async (student: AdminStudent) => {
      if (!student?.id) return
      if (transcriptsByStudent[student.id]) return
      setLoadingTranscriptsFor(student.id)
      try {
        const params = new URLSearchParams()
        params.set('scope', 'lessons')
        params.set('page', '1')
        params.set('limit', '20')
        params.set('userId', student.id)
        const res = await adminApiRequest(`/.netlify/functions/admin-speaking-flags?${params.toString()}`, { method: 'GET' })
        const data = await res.json()
        if (!data?.success) throw new Error(data?.error || 'Failed to load transcripts')
        const items: TranscriptItem[] = Array.isArray(data.items)
          ? data.items.map((it: any) => ({
              job_id: it.job_id,
              prompt: it.prompt ?? null,
              prompt_id: it.prompt_id ?? null,
              created_at: it.created_at,
              transcript: it.transcript || '',
              status: it.status || '',
            }))
          : []
        setTranscriptsByStudent((prev) => ({ ...prev, [student.id]: items }))
      } catch (e) {
        showNotification((e as Error).message || 'Failed to load transcripts', 'error')
      } finally {
        setLoadingTranscriptsFor(null)
      }
    },
    [transcriptsByStudent, showNotification]
  )

  const loadAudioUrl = useCallback(
    async (jobId: string) => {
      if (!jobId || audioUrlByJob[jobId]) return
      setLoadingAudioJob(jobId)
      try {
        const res = await adminApiRequest(
          `/.netlify/functions/admin-get-speech-audio-url?jobId=${encodeURIComponent(jobId)}`,
          { method: 'GET' }
        )
        const data = await res.json()
        if (!data?.success || !data?.url) throw new Error(data?.error || 'Audio not found')
        setAudioUrlByJob((prev) => ({ ...prev, [jobId]: data.url as string }))
      } catch (e) {
        showNotification((e as Error).message || 'Failed to load audio', 'error')
      } finally {
        setLoadingAudioJob(null)
      }
    },
    [audioUrlByJob, showNotification]
  )

  const StudentTable = ({ title, list }: { title: string; list: AdminStudent[] }) => (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h2 className="text-lg font-semibold text-slate-800">Class {title}</h2>
        <div className="text-sm text-slate-600">{list.length} students</div>
      </div>

      <Table>
        <Header>
          <Row>
            <Head>ID</Head>
            <Head>Nickname</Head>
            <Head>Lessons</Head>
            <Head>Speech jobs</Head>
            <Head>Actions</Head>
          </Row>
        </Header>
        <Body>
          {list.map((s) => {
            const isOpen = expanded.has(s.id)
            return (
              <React.Fragment key={s.id}>
                <Row className={isOpen ? 'bg-slate-50' : 'hover:bg-slate-50'}>
                  <Cell className="text-sm font-semibold text-slate-800 tabular-nums">
                    <button
                      type="button"
                      onClick={() => toggleExpanded(s)}
                      className="text-left hover:text-purple-700 underline-offset-2 hover:underline"
                    >
                      {s.school_student_id || '—'}
                    </button>
                  </Cell>
                  <Cell className="text-sm text-slate-700">
                    <button
                      type="button"
                      onClick={() => toggleExpanded(s)}
                      className="text-left hover:text-purple-700 underline-offset-2 hover:underline font-medium"
                    >
                      {s.nickname || '—'}
                    </button>
                  </Cell>
                  <Cell className="text-sm text-slate-700">{lessonSummary(s)}</Cell>
                  <Cell className="text-sm text-slate-700 tabular-nums">{s.speech_jobs || 0}</Cell>
                  <Cell>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="secondary" onClick={() => toggleExpanded(s)}>
                        {isOpen ? 'Hide' : 'View'}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => router.push('/admin/transcripts')}>
                        Open transcripts
                      </Button>
                    </div>
                  </Cell>
                </Row>

                {isOpen ? (
                  <Row>
                    <Cell colSpan={5}>
                      <div className="space-y-4 py-3">
                        <div>
                          <div className="text-xs font-semibold text-slate-600 mb-2">Lessons</div>
                          {s.lessons?.length ? (
                            <div className="space-y-2">
                              {s.lessons
                                .slice()
                                .sort((a, b) => a.lesson_number - b.lesson_number)
                                .map((l) => {
                                  const open = expandedLessons.has(lessonKey(s.id, l.lesson_id))
                                  const total = l.activities_total || 0
                                  const done = l.activities_done || 0
                                  return (
                                    <div
                                      key={l.lesson_id}
                                      className="rounded-lg border border-purple-100 bg-white overflow-hidden"
                                    >
                                      <button
                                        type="button"
                                        onClick={() => toggleLesson(s.id, l.lesson_id)}
                                        className="w-full px-3 py-2 flex items-center justify-between gap-3 text-left hover:bg-purple-50/50"
                                      >
                                        <div className="flex items-center gap-2 min-w-0">
                                          <span className="text-slate-400 shrink-0" aria-hidden>
                                            {open ? '▼' : '▶'}
                                          </span>
                                          <div className="text-sm text-slate-800 truncate">
                                            <span className="font-semibold">L{l.lesson_number}</span> {l.topic}
                                            {l.lesson_active === false && (
                                              <span className="ml-2 text-xs font-medium text-amber-700">(hidden)</span>
                                            )}
                                          </div>
                                        </div>
                                        <div className="flex items-center gap-3 shrink-0">
                                          <span className="text-sm font-semibold text-slate-700 tabular-nums">
                                            {done}/{total} activities
                                          </span>
                                          {l.completed ? (
                                            <span className="text-sm font-extrabold text-purple-700 tabular-nums">
                                              {l.score_percentage}%
                                            </span>
                                          ) : (
                                            <span className="text-xs text-slate-500">in progress</span>
                                          )}
                                        </div>
                                      </button>
                                      {open ? (
                                        <div className="border-t border-purple-50 px-3 py-2 text-sm text-slate-600 space-y-1">
                                          <p>
                                            <span className="font-medium text-slate-800">Activities:</span>{' '}
                                            {done} of {total} completed
                                            {total > 0 ? ` (${Math.round((done / total) * 100)}%)` : ''}
                                          </p>
                                          {l.completed ? (
                                            <p>
                                              <span className="font-medium text-slate-800">Final score:</span>{' '}
                                              {l.score_percentage}%
                                              {l.completed_at
                                                ? ` · ${new Date(l.completed_at).toLocaleString()}`
                                                : ''}
                                            </p>
                                          ) : done > 0 ? (
                                            <p className="text-amber-800">Lesson not finished yet.</p>
                                          ) : (
                                            <p>Not started.</p>
                                          )}
                                        </div>
                                      ) : null}
                                    </div>
                                  )
                                })}
                            </div>
                          ) : (
                            <div className="text-sm text-slate-500">No lessons available.</div>
                          )}
                        </div>

                        <div>
                          <div className="text-xs font-semibold text-slate-600 mb-2">Audio recordings & transcripts</div>
                          {loadingTranscriptsFor === s.id ? (
                            <div className="text-sm text-slate-500">Loading…</div>
                          ) : (transcriptsByStudent[s.id] || []).length ? (
                            <div className="space-y-3">
                              {(transcriptsByStudent[s.id] || []).map((it) => (
                                <div key={it.job_id} className="rounded-lg border border-slate-200 bg-white p-3">
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div className="text-xs text-slate-600">
                                      <span className="font-semibold text-slate-800">{it.status}</span>
                                      <span className="mx-2">·</span>
                                      <span className="tabular-nums">{new Date(it.created_at).toLocaleString()}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <Button
                                        size="sm"
                                        variant="secondary"
                                        disabled={loadingAudioJob === it.job_id}
                                        onClick={() => loadAudioUrl(it.job_id)}
                                      >
                                        {audioUrlByJob[it.job_id] ? 'Loaded' : loadingAudioJob === it.job_id ? 'Loading…' : 'Load audio'}
                                      </Button>
                                    </div>
                                  </div>
                                  {audioUrlByJob[it.job_id] && (
                                    <audio className="w-full mt-2" controls src={audioUrlByJob[it.job_id]} />
                                  )}
                                  <div className="mt-2 text-sm text-slate-800 whitespace-pre-wrap">
                                    {it.transcript || '—'}
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="text-sm text-slate-500">No speech jobs found.</div>
                          )}
                        </div>
                      </div>
                    </Cell>
                  </Row>
                ) : null}
              </React.Fragment>
            )
          })}
        </Body>
      </Table>
    </Card>
  )

  return (
    <AdminProtectedRoute>
      <main className="min-h-screen bg-slate-900 p-4 sm:p-6">
        <div className="max-w-6xl mx-auto space-y-4">
          <div className="flex items-center justify-between gap-3">
            <Button variant="secondary" size="sm" onClick={() => router.push('/admin/dashboard')}>
              ← Back to Dashboard
            </Button>
            <Button variant="ghost" size="sm" onClick={() => { load(); loadTrackLessons() }} disabled={loading}>
              Refresh
            </Button>
          </div>

          <Card className="p-5 bg-gradient-to-br from-white to-purple-50 border-purple-200">
            <h1 className="text-2xl font-bold text-slate-900">Students</h1>
            <p className="text-sm text-slate-600 mt-1">
              Nickname + student ID. Expand a student to see lesson activity progress and speech recordings.
            </p>
          </Card>

          <Card className="p-5">
            <div className="flex items-center justify-between gap-3 mb-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-800">Student track lessons</h2>
                <p className="text-sm text-slate-600 mt-0.5">
                  Only <strong>active</strong> lessons appear on the student dashboard. New lessons start inactive.
                </p>
              </div>
            </div>
            {loadingLessons ? (
              <p className="text-sm text-slate-500">Loading lessons…</p>
            ) : trackLessons.length === 0 ? (
              <p className="text-sm text-slate-500">No student lessons in the database yet.</p>
            ) : (
              <div className="space-y-2">
                {trackLessons.map((lesson) => (
                  <div
                    key={lesson.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-800">
                        L{lesson.lesson_number} · {lesson.topic}
                      </p>
                      <p className="text-xs text-slate-500">
                        {lesson.slug || 'no slug'} · {lesson.activity_count} activities
                      </p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span
                        className={`text-xs font-semibold uppercase tracking-wide ${
                          lesson.active ? 'text-green-700' : 'text-slate-400'
                        }`}
                      >
                        {lesson.active ? 'Active' : 'Inactive'}
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          router.push(
                            `/admin/students/test-lesson?lessonId=${encodeURIComponent(lesson.id)}`
                          )
                        }
                      >
                        Test
                      </Button>
                      <Button
                        size="sm"
                        variant={lesson.active ? 'secondary' : 'primary'}
                        disabled={togglingLessonId === lesson.id}
                        onClick={() => toggleLessonActive(lesson)}
                      >
                        {togglingLessonId === lesson.id
                          ? 'Saving…'
                          : lesson.active
                            ? 'Deactivate'
                            : 'Activate'}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {loading ? (
            <Card className="p-6 text-slate-700">Loading…</Card>
          ) : (
            <>
              <StudentTable title="1/15" list={class115} />
              <StudentTable title="1/16" list={class116} />
            </>
          )}
        </div>
      </main>
    </AdminProtectedRoute>
  )
}

