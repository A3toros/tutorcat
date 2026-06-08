'use client'

import React, { Suspense, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import AdminProtectedRoute from '@/components/auth/AdminProtectedRoute'
import { Button, Card, LoadingSpinnerModal } from '@/components/ui'
import { adminApiRequest } from '@/utils/adminApi'
import StudentActivityRenderer from '@/components/student/StudentActivityRenderer'
import type { StudentLesson, StudentLessonActivity } from '@/types/student'
import { UserContext } from '@/components/auth/ProtectedRoute'
import type { User } from '@/types'

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; lesson: StudentLesson; activities: StudentLessonActivity[] }

function AdminTestStudentLessonPageInner() {
  const router = useRouter()
  const params = useSearchParams()
  const lessonId = params.get('lessonId') || ''

  const [state, setState] = useState<LoadState>({ kind: 'loading' })
  const [completedOrders, setCompletedOrders] = useState<Set<number>>(new Set())
  const fakeUser = useMemo<User>(
    () => ({
      id: 'admin-test',
      email: 'admin-test@local',
      username: 'admin-test',
      firstName: 'Admin',
      lastName: 'Test',
      level: 'A1',
      role: 'admin',
    }),
    []
  )

  useEffect(() => {
    ;(window as any).__ADMIN_LESSON_TEST_MODE = true
    if (!lessonId) {
      setState({ kind: 'error', message: 'Missing lessonId.' })
      return
    }

    let cancelled = false
    ;(async () => {
      try {
        setState({ kind: 'loading' })
        const res = await adminApiRequest(
          `/.netlify/functions/admin-get-student-lesson?lessonId=${encodeURIComponent(lessonId)}`,
          { method: 'GET' }
        )
        const data = await res.json()
        if (!data?.success) throw new Error(data?.error || 'Failed to load lesson')
        const lesson = data.lesson as StudentLesson
        const activities = (data.activities as StudentLessonActivity[]) || []
        if (!cancelled) {
          setState({
            kind: 'ready',
            lesson,
            activities: activities.slice().sort((a, b) => a.activity_order - b.activity_order),
          })
        }
      } catch (e) {
        if (!cancelled) {
          setState({ kind: 'error', message: (e as Error).message || 'Failed to load lesson' })
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [lessonId])

  const header = useMemo(() => {
    if (state.kind !== 'ready') return null
    return (
      <Card className="p-5 bg-gradient-to-br from-white to-purple-50 border-purple-200">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-slate-900">
              Test lesson: L{state.lesson.lesson_number} {state.lesson.topic}
            </h1>
            <p className="text-sm text-slate-600 mt-1">
              This is a sandbox preview. <strong>No progress is saved.</strong>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setCompletedOrders(new Set())
              }}
            >
              Reset local test
            </Button>
          </div>
        </div>
      </Card>
    )
  }, [state])

  return (
    <AdminProtectedRoute>
      <UserContext.Provider value={{ user: fakeUser, checkAuthStatus: async () => {} }}>
      <main className="min-h-screen bg-slate-900 p-4 sm:p-6">
        <div className="max-w-5xl mx-auto space-y-4">
          <div className="flex items-center justify-between gap-3">
            <Button variant="secondary" size="sm" onClick={() => router.push('/admin/students')}>
              ← Back to Students
            </Button>
          </div>

          {state.kind === 'loading' ? (
            <Card className="p-6 text-slate-700">Loading…</Card>
          ) : state.kind === 'error' ? (
            <Card className="p-6 text-slate-700">
              <p className="font-semibold text-slate-900">Could not load lesson</p>
              <p className="mt-2 text-sm text-slate-600">{state.message}</p>
            </Card>
          ) : (
            <>
              {header}

              <Card className="p-4 sm:p-6">
                <p className="text-sm text-slate-700">
                  Completed in this test run:{' '}
                  <span className="font-semibold tabular-nums">{completedOrders.size}</span>/
                  <span className="font-semibold tabular-nums">{state.activities.length}</span>
                </p>
              </Card>

              <div className="space-y-4">
                {state.activities.map((activity) => (
                  <div key={activity.id} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-semibold text-slate-300 uppercase tracking-wide">
                        Activity {activity.activity_order}: {activity.activity_type}
                      </div>
                      {completedOrders.has(activity.activity_order) ? (
                        <div className="text-xs font-semibold text-green-300">Completed</div>
                      ) : (
                        <div className="text-xs text-slate-400">—</div>
                      )}
                    </div>
                    <StudentActivityRenderer
                      lesson={state.lesson}
                      activity={activity}
                      onComplete={() => {
                        setCompletedOrders((prev) => {
                          const next = new Set(prev)
                          next.add(activity.activity_order)
                          return next
                        })
                      }}
                    />
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </main>
      </UserContext.Provider>
    </AdminProtectedRoute>
  )
}

export default function AdminTestStudentLessonPage() {
  return (
    <Suspense fallback={<LoadingSpinnerModal isOpen message="Loading..." />}>
      <AdminTestStudentLessonPageInner />
    </Suspense>
  )
}

