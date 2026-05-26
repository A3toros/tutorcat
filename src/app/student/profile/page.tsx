'use client'

import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import StudentProtectedRoute from '@/components/auth/StudentProtectedRoute'
import { useUser } from '@/components/auth/ProtectedRoute'
import { Button, Card } from '@/components/ui'
import { apiClient } from '@/lib/api'

function StudentProfileContent() {
  const { user } = useUser()
  const router = useRouter()
  const [stats, setStats] = useState({ completedLessons: 0, totalLessons: 0 })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    apiClient.getStudentDashboard().then((res) => {
      if (res.success && res.data) {
        const data = res.data as { progress?: { completedLessons: number; totalLessons: number } }
        setStats(data.progress || { completedLessons: 0, totalLessons: 0 })
      }
      setLoading(false)
    })
  }, [])

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 via-purple-50 to-indigo-100 py-4 px-3 sm:py-8 sm:px-4">
      <div className="max-w-lg mx-auto">
        <Button variant="ghost" size="sm" onClick={() => router.push('/student_dashboard')}>
          ← Dashboard
        </Button>
        <Card className="p-4 sm:p-6 mt-4">
          <h1 className="text-2xl font-bold text-slate-800 mb-6">My profile</h1>
          <dl className="space-y-4">
            <div>
              <dt className="text-sm text-slate-500">Nickname</dt>
              <dd className="font-medium text-slate-800">{user?.nickname || '—'}</dd>
            </div>
            <div>
              <dt className="text-sm text-slate-500">Name</dt>
              <dd className="font-medium text-slate-800">
                {user?.honorific} {user?.firstName || user?.first_name}{' '}
                {user?.lastName || user?.last_name}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-slate-500">Student ID</dt>
              <dd className="font-medium text-slate-800">{user?.schoolStudentId || '—'}</dd>
            </div>
            <div>
              <dt className="text-sm text-slate-500">Email</dt>
              <dd className="font-medium text-slate-800">{user?.email}</dd>
            </div>
            <div>
              <dt className="text-sm text-slate-500">Username (login)</dt>
              <dd className="font-medium text-slate-800">{user?.username}</dd>
            </div>
          </dl>
          <div className="mt-8 pt-6 border-t border-slate-200">
            <h2 className="text-sm font-semibold text-slate-700 mb-2">Classroom progress</h2>
            {loading ? (
              <p className="text-slate-500 text-sm">Loading...</p>
            ) : (
              <p className="text-slate-800">
                {stats.completedLessons} / {stats.totalLessons} lessons completed
              </p>
            )}
          </div>
        </Card>
      </div>
    </div>
  )
}

export default function StudentProfilePage() {
  return (
    <StudentProtectedRoute>
      <StudentProfileContent />
    </StudentProtectedRoute>
  )
}
