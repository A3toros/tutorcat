'use client'

import React, { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import StudentProtectedRoute from '@/components/auth/StudentProtectedRoute'
import StudentLessonRunner from '@/components/student/StudentLessonRunner'
import { LoadingSpinnerModal } from '@/components/ui'

function StudentLessonPageInner() {
  const searchParams = useSearchParams()
  const lessonId = searchParams.get('lessonId')

  if (!lessonId) {
    return (
      <div className="max-w-lg mx-auto py-12 text-center text-slate-600">
        Missing lesson ID.
      </div>
    )
  }

  return <StudentLessonRunner lessonId={lessonId} />
}

export default function StudentLessonsPage() {
  return (
    <StudentProtectedRoute>
      <Suspense fallback={<LoadingSpinnerModal isOpen message="Loading..." />}>
        <StudentLessonPageInner />
      </Suspense>
    </StudentProtectedRoute>
  )
}
