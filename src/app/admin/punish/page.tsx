'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import AdminProtectedRoute from '@/components/auth/AdminProtectedRoute'
import { Button, Card, Input, Select } from '@/components/ui'
import { useNotification } from '@/contexts/NotificationContext'
import { adminApiRequest } from '@/utils/adminApi'

const CEFR_LEVELS = ['Pre-A1', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const

type PreviewLesson = {
  id: string
  level: string
  lesson_number: number
  topic: string
}

type RestrictedStudent = {
  user_id: string
  school_student_id: string | null
  nickname: string | null
  first_name: string | null
  last_name: string | null
  assignment_count: number
  last_assigned_at: string
  lessons: Array<{
    lesson_id: string
    level: string
    lesson_number: number
    topic: string
  }>
}

export default function AdminPunishPage() {
  const router = useRouter()
  const { showNotification } = useNotification()

  const [level, setLevel] = useState<string>('A1')
  const [lessonFrom, setLessonFrom] = useState('1')
  const [lessonTo, setLessonTo] = useState('10')
  const [studentIds, setStudentIds] = useState('')
  const [notes, setNotes] = useState('')
  const [replaceExisting, setReplaceExisting] = useState(false)
  const [previewLessons, setPreviewLessons] = useState<PreviewLesson[]>([])
  const [restrictedStudents, setRestrictedStudents] = useState<RestrictedStudent[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  const loadData = useCallback(async () => {
    setIsLoading(true)
    try {
      const from = parseInt(lessonFrom, 10)
      const to = parseInt(lessonTo, 10)
      const params = new URLSearchParams({ level })
      if (Number.isFinite(from)) params.set('from', String(from))
      if (Number.isFinite(to)) params.set('to', String(to))

      const res = await adminApiRequest(
        `/.netlify/functions/admin-punish-lessons?${params.toString()}`,
        { method: 'GET' }
      )
      const data = await res.json()
      if (!data?.success) throw new Error(data?.error || 'Failed to load')
      setPreviewLessons(data.preview_lessons || [])
      setRestrictedStudents(data.restricted_students || [])
    } catch (e) {
      showNotification((e as Error).message || 'Failed to load punish data', 'error')
    } finally {
      setIsLoading(false)
    }
  }, [level, lessonFrom, lessonTo, showNotification])

  useEffect(() => {
    loadData()
  }, [loadData])

  const previewLabel = useMemo(() => {
    const from = parseInt(lessonFrom, 10)
    const to = parseInt(lessonTo, 10)
    if (!Number.isFinite(from) || !Number.isFinite(to)) return '—'
    return `${level} lessons ${Math.min(from, to)}–${Math.max(from, to)}`
  }, [level, lessonFrom, lessonTo])

  const assignLessons = async (addAnother: boolean) => {
    setIsSaving(true)
    try {
      const res = await adminApiRequest('/.netlify/functions/admin-punish-lessons', {
        method: 'POST',
        body: JSON.stringify({
          level,
          lesson_from: parseInt(lessonFrom, 10),
          lesson_to: parseInt(lessonTo, 10),
          student_ids: studentIds,
          notes: notes.trim() || undefined,
          replace: replaceExisting,
        }),
      })
      const data = await res.json()
      if (!data?.success) throw new Error(data?.error || 'Failed to assign lessons')

      const studentCount = data.students?.length ?? 0
      const lessonCount = data.lessons?.length ?? 0
      showNotification(
        `Assigned ${lessonCount} lesson(s) to ${studentCount} student(s)`,
        'success'
      )
      if (data.not_found?.length) {
        showNotification(`IDs not found: ${data.not_found.join(', ')}`, 'error')
      }
      await loadData()
      if (addAnother) {
        setStudentIds('')
        setNotes('')
      } else {
        setStudentIds('')
        setNotes('')
        setLessonFrom('1')
        setLessonTo('10')
      }
    } catch (e) {
      showNotification((e as Error).message || 'Failed to assign', 'error')
    } finally {
      setIsSaving(false)
    }
  }

  const clearStudents = async (ids: string) => {
    if (!ids.trim()) return
    setIsSaving(true)
    try {
      const res = await adminApiRequest('/.netlify/functions/admin-punish-lessons', {
        method: 'DELETE',
        body: JSON.stringify({ student_ids: ids }),
      })
      const data = await res.json()
      if (!data?.success) throw new Error(data?.error || 'Failed to clear')
      showNotification(`Cleared assignments for ${data.cleared_students} student(s)`, 'success')
      await loadData()
    } catch (e) {
      showNotification((e as Error).message || 'Failed to clear', 'error')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <AdminProtectedRoute>
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-red-50 p-6">
        <div className="max-w-5xl mx-auto space-y-6">
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="secondary" size="sm" onClick={() => router.push('/admin/dashboard')}>
              ← Dashboard
            </Button>
            <Button variant="secondary" size="sm" onClick={() => router.push('/admin/students')}>
              Students
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-slate-800">Punish / assign lessons</h1>
              <p className="text-slate-600 text-sm">
                Assign main-app platform lessons by level and number. Students see only those lessons
                until you clear assignments.
              </p>
            </div>
          </div>

          <Card className="border-red-200 bg-white shadow-lg">
            <Card.Header>
              <h2 className="text-lg font-semibold text-slate-800">Add lessons</h2>
            </Card.Header>
            <Card.Body className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Level</label>
                  <Select value={level} onChange={(e) => setLevel(e.target.value)} className="w-full">
                    {CEFR_LEVELS.map((lv) => (
                      <option key={lv} value={lv}>
                        {lv}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Lesson from
                  </label>
                  <Input
                    type="number"
                    min={1}
                    value={lessonFrom}
                    onChange={(e) => setLessonFrom(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Lesson to</label>
                  <Input
                    type="number"
                    min={1}
                    value={lessonTo}
                    onChange={(e) => setLessonTo(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Student IDs (school ID or user UUID, comma / newline separated)
                </label>
                <textarea
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm min-h-[5rem] font-mono"
                  placeholder="52448, 52470&#10;or paste UUIDs"
                  value={studentIds}
                  onChange={(e) => setStudentIds(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Notes (optional)</label>
                <Input
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. missed homework week 12"
                />
              </div>

              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={replaceExisting}
                  onChange={(e) => setReplaceExisting(e.target.checked)}
                />
                Replace existing assignments (otherwise append to current set)
              </label>

              <div>
                <p className="text-sm font-medium text-slate-700 mb-2">Preview: {previewLabel}</p>
                {isLoading ? (
                  <p className="text-sm text-slate-500">Loading preview…</p>
                ) : previewLessons.length === 0 ? (
                  <p className="text-sm text-amber-700">
                    No lessons in this range. Check level and numbers in Content.
                  </p>
                ) : (
                  <ol className="list-decimal list-inside text-sm text-slate-600 space-y-1 max-h-48 overflow-y-auto border border-slate-100 rounded-lg p-3">
                    {previewLessons.map((l) => (
                      <li key={l.id}>
                        {l.level} #{l.lesson_number}: {l.topic}
                      </li>
                    ))}
                  </ol>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={() => assignLessons(false)}
                  disabled={isSaving || !studentIds.trim() || previewLessons.length === 0}
                >
                  Add
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => assignLessons(true)}
                  disabled={isSaving || !studentIds.trim() || previewLessons.length === 0}
                >
                  Add another
                </Button>
              </div>
            </Card.Body>
          </Card>

          <Card className="border-slate-200 bg-white">
            <Card.Header>
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-lg font-semibold text-slate-800">Currently restricted students</h2>
                <Button variant="ghost" size="sm" disabled={isLoading} onClick={loadData}>
                  Refresh
                </Button>
              </div>
            </Card.Header>
            <Card.Body>
              {isLoading ? (
                <p className="text-slate-500 text-sm">Loading…</p>
              ) : restrictedStudents.length === 0 ? (
                <p className="text-slate-500 text-sm">No students with platform lesson assignments.</p>
              ) : (
                <ul className="space-y-4">
                  {restrictedStudents.map((s) => {
                    const name =
                      s.nickname ||
                      [s.first_name, s.last_name].filter(Boolean).join(' ') ||
                      'Student'
                    const idLabel = s.school_student_id || s.user_id.slice(0, 8)
                    return (
                      <li key={s.user_id} className="border border-slate-100 rounded-lg p-4 text-sm">
                        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                          <div>
                            <span className="font-semibold text-slate-800">{name}</span>
                            <span className="text-slate-500 ml-2">ID {idLabel}</span>
                            <span className="text-slate-400 ml-2">
                              · {s.assignment_count} lesson(s)
                            </span>
                          </div>
                          <Button
                            variant="secondary"
                            size="sm"
                            disabled={isSaving}
                            onClick={() => clearStudents(s.school_student_id || s.user_id)}
                          >
                            Clear all
                          </Button>
                        </div>
                        <ul className="text-slate-600 space-y-0.5">
                          {(s.lessons || []).map((l) => (
                            <li key={l.lesson_id}>
                              {l.level} #{l.lesson_number}: {l.topic}
                            </li>
                          ))}
                        </ul>
                      </li>
                    )
                  })}
                </ul>
              )}
            </Card.Body>
          </Card>
        </div>
      </div>
    </AdminProtectedRoute>
  )
}
