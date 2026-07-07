'use client'

import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { useUser } from '@/components/auth/ProtectedRoute'
import { Button, Card, Mascot, ProgressBar } from '@/components/ui'
import { apiClient } from '@/lib/api'
import type { StudentDashboardLesson } from '@/types/student'

export default function StudentDashboardContent() {
  const { user } = useUser()
  const router = useRouter()
  const [lessons, setLessons] = useState<StudentDashboardLesson[]>([])
  const [progress, setProgress] = useState({ completedLessons: 0, totalLessons: 0 })
  const [restrictedToPlatform, setRestrictedToPlatform] = useState(false)
  const [allAssignedComplete, setAllAssignedComplete] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      try {
        const res = await apiClient.getStudentDashboard()
        if (res.success && res.data) {
          const data = res.data as {
            lessons: StudentDashboardLesson[]
            progress: { completedLessons: number; totalLessons: number }
            restricted_to_platform_lessons?: boolean
            all_assigned_complete?: boolean
          }
          setLessons(data.lessons || [])
          setProgress(data.progress || { completedLessons: 0, totalLessons: 0 })
          setRestrictedToPlatform(Boolean(data.restricted_to_platform_lessons))
          setAllAssignedComplete(Boolean(data.all_assigned_complete))
        }
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const displayName =
    user?.nickname || user?.firstName || user?.first_name || user?.username || 'Student'

  const currentLesson = lessons[0] ?? null

  const openLesson = (lesson: StudentDashboardLesson) => {
    if (lesson.track === 'platform') {
      router.push(`/lessons?lessonId=${lesson.id}&fromStudentPunish=1`)
    } else {
      router.push(`/student/lessons?lessonId=${lesson.id}`)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 via-purple-50 to-indigo-100">
      <div className="max-w-4xl mx-auto px-3 py-4 sm:px-4 sm:py-8">
        <motion.div
          className="bg-white/80 backdrop-blur rounded-xl shadow-sm border border-purple-100 p-4 sm:p-6 mb-4 sm:mb-8"
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-4">
              <Mascot size="md" emotion="excited" className="hidden sm:block" />
              <div>
                <h1 className="text-2xl font-bold text-slate-800">Hello, {displayName}!</h1>
                <p className="text-sm text-purple-600">
                  {user?.honorific} {user?.firstName || user?.first_name}{' '}
                  {user?.lastName || user?.last_name}
                  {user?.schoolStudentId && (
                    <span className="text-slate-500"> · ID {user.schoolStudentId}</span>
                  )}
                </p>
              </div>
            </div>
            <Button variant="secondary" size="sm" onClick={() => router.push('/student/profile')}>
              Profile
            </Button>
          </div>
        </motion.div>

        <Card className="p-4 sm:p-6 mb-4 sm:mb-8">
          <h2 className="text-lg font-semibold text-slate-800 mb-2">Your progress</h2>
          <p className="text-slate-600 text-sm mb-3">
            {progress.completedLessons} of {progress.totalLessons} lessons completed
          </p>
          <ProgressBar
            progress={
              progress.totalLessons
                ? Math.round((progress.completedLessons / progress.totalLessons) * 100)
                : 0
            }
          />
        </Card>

        {restrictedToPlatform && (
          <Card className="p-4 mb-4 border-amber-200 bg-amber-50/80 text-amber-900 text-sm">
            Your teacher assigned review lessons. Complete them one at a time — the next lesson
            unlocks when you finish the current one.
          </Card>
        )}

        {loading ? (
          <p className="text-slate-500">Loading lessons...</p>
        ) : restrictedToPlatform ? (
          allAssignedComplete ? (
            <Card className="p-8 text-center border-green-200 bg-green-50/50">
              <div className="text-5xl mb-3">✓</div>
              <h2 className="text-xl font-bold text-slate-800 mb-2">All assigned lessons complete</h2>
              <p className="text-slate-600 text-sm">
                You finished all {progress.totalLessons} assigned lesson
                {progress.totalLessons === 1 ? '' : 's'}. Your teacher can clear this restriction or
                assign more.
              </p>
            </Card>
          ) : currentLesson ? (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
              <h2 className="text-lg font-semibold text-slate-800 mb-4">Continue learning</h2>
              <Card className="p-6 border-indigo-200 bg-gradient-to-br from-white to-indigo-50 shadow-lg">
                <p className="text-xs font-medium text-purple-600 uppercase mb-1">
                  {currentLesson.level
                    ? `${currentLesson.level} · Lesson ${currentLesson.lesson_number}`
                    : `Lesson ${currentLesson.lesson_number}`}
                  {progress.totalLessons > 1 && (
                    <span className="text-slate-400 normal-case ml-2">
                      ({progress.completedLessons + 1} of {progress.totalLessons})
                    </span>
                  )}
                </p>
                <h3 className="text-xl font-bold text-slate-800 mb-2">{currentLesson.topic}</h3>
                {currentLesson.progress_percentage > 0 && !currentLesson.completed && (
                  <div className="mb-4">
                    <ProgressBar progress={currentLesson.progress_percentage} />
                    <p className="text-xs text-slate-500 mt-1">
                      {currentLesson.progress_percentage}% complete
                    </p>
                  </div>
                )}
                <Button
                  className="w-full sm:w-auto"
                  onClick={() => openLesson(currentLesson)}
                >
                  {currentLesson.progress_percentage > 0 && !currentLesson.completed
                    ? 'Continue lesson'
                    : 'Start lesson'}
                </Button>
              </Card>
            </motion.div>
          ) : (
            <Card className="p-6 text-slate-600">No lesson available right now.</Card>
          )
        ) : lessons.length === 0 ? (
          <Card className="p-6 text-slate-600">
            No lessons available yet. Your teacher will add them soon.
          </Card>
        ) : (
          <>
            <h2 className="text-lg font-semibold text-slate-800 mb-4">Lessons</h2>
            <div className="space-y-4">
              {lessons.map((lesson) => (
                <Card key={lesson.id} className="p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-medium text-purple-600 uppercase">
                        Lesson {lesson.lesson_number}
                      </p>
                      <h3 className="text-lg font-semibold text-slate-800">{lesson.topic}</h3>
                      {lesson.communication_goal && (
                        <p className="text-sm text-slate-500 mt-1">{lesson.communication_goal}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      {lesson.completed && (
                        <span className="inline-flex items-center gap-2 rounded-full border border-purple-200 bg-gradient-to-r from-fuchsia-50 via-purple-50 to-indigo-50 px-3 py-1 text-sm font-semibold text-purple-800">
                          Passed
                          {typeof lesson.score_percentage === 'number' && (
                            <span className="rounded-full bg-white/70 px-2 py-0.5 text-purple-900 tabular-nums">
                              {lesson.score_percentage}%
                            </span>
                          )}
                        </span>
                      )}
                      <Button onClick={() => openLesson(lesson)}>
                        {lesson.completed ? 'Review' : 'Start'}
                      </Button>
                    </div>
                  </div>
                  <ProgressBar className="mt-3" progress={lesson.progress_percentage} />
                </Card>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
