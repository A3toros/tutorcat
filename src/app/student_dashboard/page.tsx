'use client'

import React from 'react'
import dynamic from 'next/dynamic'
import StudentProtectedRoute from '@/components/auth/StudentProtectedRoute'

const StudentDashboardContent = dynamic(
  () => import('@/components/student/StudentDashboardContent'),
  {
    ssr: false,
    loading: () => (
      <div className="min-h-screen bg-gradient-to-br from-sky-50 via-purple-50 to-indigo-100 flex items-center justify-center">
        <p className="text-slate-600">Loading classroom...</p>
      </div>
    ),
  }
)

export default function StudentDashboardPage() {
  return (
    <StudentProtectedRoute>
      <StudentDashboardContent />
    </StudentProtectedRoute>
  )
}
