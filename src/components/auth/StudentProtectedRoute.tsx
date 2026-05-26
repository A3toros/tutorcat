'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { apiClient } from '@/lib/api'
import { getHomePathForRole } from '@/lib/authRedirects'
import { User } from '@/types'
import { UserContext } from '@/components/auth/ProtectedRoute'

interface StudentProtectedRouteProps {
  children: React.ReactNode
}

/**
 * Protects student-only routes (same pattern as AdminProtectedRoute).
 * - Allows access only when role is student
 * - Redirects admin → /admin/dashboard, other users → /dashboard
 */
const StudentProtectedRoute: React.FC<StudentProtectedRouteProps> = ({ children }) => {
  const { user: authUser, isLoading: authLoading } = useAuth()
  const [user, setUser] = useState<User | null>(null)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  const checkAuthStatus = useCallback(async () => {
    try {
      const response = await apiClient.getCurrentUser()
      const currentUser = response.data?.user as User | undefined

      if (response.success && currentUser?.role === 'student') {
        setUser(currentUser)
        setIsAuthenticated(true)
        return
      }

      if (response.success && currentUser) {
        window.location.href = getHomePathForRole(currentUser.role)
        return
      }

      window.location.href = '/'
    } catch {
      window.location.href = '/'
    }
  }, [])

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (isLoading) {
        setIsLoading(false)
        setIsAuthenticated(false)
        const path = typeof window !== 'undefined' ? window.location.pathname : ''
        if (path.startsWith('/student') || path.startsWith('/student_dashboard')) {
          window.location.href = '/'
        }
      }
    }, 5000)

    const run = async () => {
      if (authLoading) {
        setIsLoading(true)
        return
      }

      if (authUser?.role === 'student') {
        clearTimeout(timeoutId)
        setUser(authUser)
        setIsAuthenticated(true)
        setIsLoading(false)
        return
      }

      if (authUser?.role) {
        clearTimeout(timeoutId)
        window.location.href = getHomePathForRole(authUser.role)
        return
      }

      await checkAuthStatus()
      clearTimeout(timeoutId)
      setIsLoading(false)
    }

    run()

    return () => clearTimeout(timeoutId)
  }, [authUser, authLoading, checkAuthStatus, isLoading])

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-sky-50 via-purple-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-slate-600">Loading your classroom...</p>
        </div>
      </div>
    )
  }

  if (!isAuthenticated || !user) {
    return null
  }

  return (
    <UserContext.Provider value={{ user, checkAuthStatus }}>
      {children}
    </UserContext.Provider>
  )
}

export default StudentProtectedRoute
