'use client'

import React, { useEffect, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'

interface AdminProtectedRouteProps {
  children: React.ReactNode
}

/**
 * Protects admin routes. Relies on AuthContext (getCurrentUser) for role — do not
 * pre-flight admin-get-stats here; ad blockers block URLs containing "stats"
 * (ERR_BLOCKED_BY_CLIENT), which previously left the page stuck on loading.
 * Expired admin_token is handled by adminApiRequest on the first real admin call.
 */
const AdminProtectedRoute: React.FC<AdminProtectedRouteProps> = ({ children }) => {
  const { user, isLoading: authLoading } = useAuth()
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (authLoading) {
      setIsLoading(true)
      return
    }

    if (user?.role === 'admin') {
      setIsAuthenticated(true)
      setIsLoading(false)
      return
    }

    if (user && user.role !== 'admin') {
      setIsAuthenticated(false)
      setIsLoading(false)
      window.location.href = '/'
      return
    }

    // Auth finished but no user — not logged in
    setIsAuthenticated(false)
    setIsLoading(false)
    window.location.href = '/'
  }, [user, authLoading])

  // Safety net if AuthContext never resolves (network hang)
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (authLoading) {
        console.warn('AdminProtectedRoute: AuthContext still loading after 10s, redirecting home')
        window.location.href = '/'
      }
    }, 10000)
    return () => clearTimeout(timeoutId)
  }, [authLoading])

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-white text-center">
          <div className="animate-spin w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p>Verifying admin access...</p>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return null
  }

  return <>{children}</>
}

export default AdminProtectedRoute
