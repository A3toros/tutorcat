'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button, Card, LoadingSpinnerModal, Modal, ProgressBar } from '@/components/ui'
import { apiClient } from '@/lib/api'
import { studentLessonProgressStorage } from '@/services/StudentLessonProgressStorage'
import { useUser } from '@/components/student/StudentProtectedRoute'
import StudentActivityRenderer from './StudentActivityRenderer'
import {
  STUDENT_SECTIONS,
  type StudentActivityResult,
  type StudentLesson,
  type StudentLessonActivity,
  type StudentUserProgress,
} from '@/types/student'

interface Props {
  lessonId: string
}

function buildCompletedOrders(
  results: StudentActivityResult[],
  activities: StudentLessonActivity[]
): Set<number> {
  const done = new Set<number>()
  const activityIds = new Set(activities.map((a) => a.id))

  for (const r of results) {
    if (r.activityOrder != null) {
      done.add(Number(r.activityOrder))
    }
    if (r.activityId && activityIds.has(r.activityId)) {
      const act = activities.find((a) => a.id === r.activityId)
      if (act) done.add(act.activity_order)
    }
  }
  return done
}

export default function StudentLessonRunner({ lessonId }: Props) {
  const router = useRouter()
  const { user } = useUser()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [lesson, setLesson] = useState<StudentLesson | null>(null)
  const [activities, setActivities] = useState<StudentLessonActivity[]>([])
  const [userProgress, setUserProgress] = useState<StudentUserProgress | null>(null)
  const [activityIndex, setActivityIndex] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [showComplete, setShowComplete] = useState(false)
  const [pendingFinalize, setPendingFinalize] = useState(false)
  const [finalizeResult, setFinalizeResult] = useState<{
    percentage: number
    passed: boolean
  } | null>(null)
  const [completedOrders, setCompletedOrders] = useState<Set<number>>(new Set())

  const findFirstIncompleteIndex = useCallback(
    (acts: StudentLessonActivity[], done: Set<number>) => {
      const idx = acts.findIndex((a) => !done.has(a.activity_order))
      return idx >= 0 ? idx : acts.length
    },
    []
  )

  const loadLesson = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await apiClient.getStudentLesson(lessonId)
      if (!res.success || !res.data) {
        setError(res.error || 'Failed to load lesson')
        return
      }
      const data = res.data as {
        lesson: StudentLesson
        activities: StudentLessonActivity[]
        activityResults?: StudentActivityResult[]
        userProgress?: StudentUserProgress | null
      }
      setLesson(data.lesson)
      const acts = (data.activities || []).sort(
        (a, b) => a.activity_order - b.activity_order
      )
      setActivities(acts)
      setUserProgress(data.userProgress ?? null)

      const done = buildCompletedOrders(data.activityResults || [], acts)

      if (user?.id) {
        const local = studentLessonProgressStorage.load(user.id, lessonId)
        if (local?.completedOrders?.length) {
          for (const order of local.completedOrders) {
            done.add(order)
          }
        }
      }

      setCompletedOrders(done)

      if (data.userProgress?.completed) {
        setPendingFinalize(false)
        setActivityIndex(acts.length > 0 ? acts.length - 1 : 0)
        setFinalizeResult({
          percentage: 100,
          passed: true,
        })
        setShowComplete(true)
        return
      }

      const firstIdx = findFirstIncompleteIndex(acts, done)
      if (firstIdx >= acts.length && acts.length > 0) {
        setActivityIndex(acts.length - 1)
        setPendingFinalize(true)
      } else {
        let resumeIdx = firstIdx
        if (user?.id) {
          const local = studentLessonProgressStorage.load(user.id, lessonId)
          if (
            local &&
            local.activityIndex >= 0 &&
            local.activityIndex < acts.length &&
            !done.has(acts[local.activityIndex]?.activity_order)
          ) {
            resumeIdx = local.activityIndex
          }
        }
        setActivityIndex(resumeIdx)
        setPendingFinalize(false)
      }
    } catch {
      setError('Failed to load lesson')
    } finally {
      setLoading(false)
    }
  }, [lessonId, findFirstIncompleteIndex, user?.id])

  useEffect(() => {
    loadLesson()
  }, [loadLesson])

  const currentActivity = activities[activityIndex]
  const allActivitiesDone =
    activities.length > 0 && completedOrders.size >= activities.length

  const sectionProgress = useMemo(() => {
    return STUDENT_SECTIONS.map((section) => {
      const sectionActs = activities.filter((a) =>
        section.activityTypes.includes(a.activity_type as never)
      )
      const done = sectionActs.every((a) => completedOrders.has(a.activity_order))
      const current = currentActivity
        ? section.activityTypes.includes(currentActivity.activity_type as never)
        : false
      return { ...section, done, current, total: sectionActs.length }
    })
  }, [activities, completedOrders, currentActivity])

  const advanceAfterComplete = useCallback(
    (done: Set<number>) => {
      if (!lesson || activities.length === 0) return

      const nextIdx = activities.findIndex(
        (a, i) => i > activityIndex && !done.has(a.activity_order)
      )
      if (nextIdx >= 0) {
        setActivityIndex(nextIdx)
        setPendingFinalize(false)
        return
      }

      const anyLeft = activities.some((a) => !done.has(a.activity_order))
      if (anyLeft) {
        setActivityIndex(findFirstIncompleteIndex(activities, done))
        setPendingFinalize(false)
        return
      }

      setPendingFinalize(true)
      setActivityIndex(activities.length - 1)
    },
    [lesson, activities, activityIndex, findFirstIncompleteIndex]
  )

  const runFinalize = async () => {
    if (!lesson) return
    setSubmitting(true)
    try {
      const fin = await apiClient.finalizeStudentLesson(lesson.id)
      const finBody = fin.data as {
        data?: { percentage: number; passed: boolean; reset?: boolean }
      }
      const payload = finBody?.data
      if (payload?.reset) {
        setCompletedOrders(new Set())
        setPendingFinalize(false)
        setActivityIndex(0)
        setError('Score below 60%. Progress reset — try the lesson again.')
        await loadLesson()
        return
      }
      setFinalizeResult({
        percentage: payload?.percentage ?? 0,
        passed: payload?.passed ?? true,
      })
      setUserProgress((p) =>
        p ? { ...p, completed: true, completed_at: new Date().toISOString() } : p
      )
      setShowComplete(true)
      setPendingFinalize(false)
      if (user?.id) {
        studentLessonProgressStorage.clear(user.id, lesson.id)
      }
    } catch {
      setError('Failed to finalize lesson')
    } finally {
      setSubmitting(false)
    }
  }

  const handleActivityComplete = async (result: {
    score: number
    maxScore: number
    attempts?: number
    timeSpent?: number
    answers?: unknown
    feedback?: unknown
  }) => {
    if (!lesson || !currentActivity) return

    const needsRetry =
      result.feedback &&
      typeof result.feedback === 'object' &&
      (result.feedback as { needsRetry?: boolean }).needsRetry

    if (needsRetry) return

    if (completedOrders.has(currentActivity.activity_order)) {
      advanceAfterComplete(completedOrders)
      return
    }

    setSubmitting(true)
    setSaveError(null)

    const nextDone = new Set(completedOrders).add(currentActivity.activity_order)
    let nextIndex = activityIndex
    const isLastActivity = nextDone.size >= activities.length
    if (isLastActivity) {
      nextIndex = activities.length - 1
    } else {
      const idx = activities.findIndex(
        (a, i) => i > activityIndex && !nextDone.has(a.activity_order)
      )
      nextIndex = idx >= 0 ? idx : findFirstIncompleteIndex(activities, nextDone)
    }

    try {
      const res = await apiClient.submitStudentLessonActivity({
        studentLessonId: lesson.id,
        activityId: currentActivity.id,
        activityType: currentActivity.activity_type,
        activityOrder: currentActivity.activity_order,
        score: result.score,
        maxScore: result.maxScore,
        attempts: result.attempts ?? 1,
        timeSpent: result.timeSpent,
        completedAt: new Date().toISOString(),
        answers: result.answers,
        feedback: result.feedback,
        isFinal: activityIndex === activities.length - 1,
      })

      if (!res.success) {
        setSaveError(
          res.error ||
            'Progress was not saved. Use npm run dev:netlify (port 8888) and check you are logged in as a student.'
        )
        return
      }

      setCompletedOrders(nextDone)

      if (user?.id) {
        studentLessonProgressStorage.save(user.id, lesson.id, {
          completedOrders: [...nextDone],
          activityIndex: nextIndex,
        })
      }

      if (isLastActivity) {
        setPendingFinalize(true)
        setActivityIndex(activities.length - 1)
      } else {
        setActivityIndex(nextIndex)
        setPendingFinalize(false)
      }
    } catch (err) {
      console.error('submitStudentLessonActivity failed', err)
      setSaveError(
        'Could not save progress. Run the app with Netlify functions (npm run dev:netlify) and try again.'
      )
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return <LoadingSpinnerModal isOpen message="Loading lesson..." />
  }

  if (error || !lesson) {
    return (
      <div className="max-w-lg mx-auto py-12 text-center">
        <p className="text-red-600 mb-4">{error || 'Lesson not found'}</p>
        <Button onClick={() => router.push('/student/dashboard')}>Back to dashboard</Button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 via-purple-50 to-indigo-100 py-4 px-3 sm:py-8 sm:px-4">
      <div className="max-w-3xl mx-auto">
        <div className="mb-6">
          <Button variant="ghost" size="sm" onClick={() => router.push('/student/dashboard')}>
            ← Dashboard
          </Button>
          <h1 className="text-2xl font-bold text-slate-800 mt-2">{lesson.topic}</h1>
          {lesson.communication_goal && (
            <p className="text-slate-600 text-sm mt-1">{lesson.communication_goal}</p>
          )}
        </div>

        <Card className="p-3 sm:p-4 mb-4 sm:mb-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 sm:gap-2">
            {sectionProgress.map((s) => (
              <div
                key={s.id}
                className={`rounded-lg px-2 py-2 text-xs text-center border ${
                  s.current
                    ? 'border-purple-500 bg-purple-50 font-semibold text-purple-900'
                    : s.done
                      ? 'border-green-300 bg-green-50 text-green-800'
                      : 'border-slate-200 text-slate-500'
                }`}
              >
                {s.label}
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-500 mt-3 mb-1">
            Activity {Math.min(activityIndex + 1, activities.length)} of {activities.length}
            {completedOrders.size > 0 && (
              <span className="ml-2 text-green-700">
                ({completedOrders.size} saved)
              </span>
            )}
          </p>
          <ProgressBar
            className="mt-1"
            progress={
              activities.length
                ? Math.round((completedOrders.size / activities.length) * 100)
                : 0
            }
          />
        </Card>

        {saveError && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {saveError}
            <button
              type="button"
              className="block mt-2 text-red-600 underline"
              onClick={() => setSaveError(null)}
            >
              Dismiss
            </button>
          </div>
        )}

        {pendingFinalize && allActivitiesDone && !userProgress?.completed ? (
          <Card className="p-4 sm:p-6 text-center">
            <h2 className="text-lg font-semibold text-slate-800 mb-2">All activities complete</h2>
            <p className="text-slate-600 mb-4">
              Your progress is saved. Finish the lesson to record your score.
            </p>
            {submitting && <LoadingSpinnerModal isOpen message="Saving..." />}
            <Button onClick={runFinalize} disabled={submitting}>
              Finish lesson
            </Button>
          </Card>
        ) : currentActivity && !userProgress?.completed ? (
          <>
            {submitting && <LoadingSpinnerModal isOpen message="Saving..." />}
            {completedOrders.has(currentActivity.activity_order) ? (
              <Card className="p-4 sm:p-6 text-center">
                <p className="text-slate-600 mb-4">
                  You already completed this activity. Moving on…
                </p>
                <Button
                  onClick={() => advanceAfterComplete(completedOrders)}
                  disabled={submitting}
                >
                  Continue
                </Button>
              </Card>
            ) : (
              <StudentActivityRenderer
                activity={currentActivity}
                lesson={lesson}
                onComplete={handleActivityComplete}
              />
            )}
          </>
        ) : (
          <Card className="p-4 sm:p-6 text-center">
            <p className="text-slate-600 mb-4">No activities in this lesson yet.</p>
            <Button onClick={() => router.push('/student/dashboard')}>Back</Button>
          </Card>
        )}
      </div>

      <Modal
        isOpen={showComplete}
        onClose={() => router.push('/student/dashboard')}
        title="Lesson complete!"
      >
        <p className="text-slate-700 mb-4">
          {finalizeResult?.passed
            ? `Great work! Score: ${finalizeResult.percentage}%`
            : `Score: ${finalizeResult?.percentage ?? 0}%. Try again to pass (60%+).`}
        </p>
        <Button onClick={() => router.push('/student/dashboard')}>Back to dashboard</Button>
      </Modal>
    </div>
  )
}
