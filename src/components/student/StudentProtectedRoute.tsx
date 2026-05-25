'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { LoadingSpinnerModal } from '@/components/ui'
import { apiClient } from '@/lib/api'
import { User } from '@/types'
import { UserContext, useUser } from '@/components/auth/ProtectedRoute'

interface StudentProtectedRouteProps {
  children: React.ReactNode
}

export const StudentProtectedRoute: React.FC<StudentProtectedRouteProps> = ({ children }) => {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(true)
  const [user, setUser] = useState<User | null>(null)

  const checkAuthStatus = useCallback(async () => {
    try {
      const response = await apiClient.getCurrentUser()
      const currentUser = response.data?.user

      if (response.success && currentUser?.role === 'student') {
        setUser(currentUser)
      } else if (response.success && currentUser?.role === 'admin') {
        window.location.href = '/admin/dashboard'
      } else if (response.success && currentUser) {
        router.push('/dashboard')
      } else {
        router.push('/')
      }
    } catch {
      router.push('/')
    } finally {
      setIsLoading(false)
    }
  }, [router])

  useEffect(() => {
    checkAuthStatus()
  }, [checkAuthStatus])

  if (isLoading) {
    return <LoadingSpinnerModal isOpen message="Loading..." />
  }

  if (!user) return null

  return (
    <UserContext.Provider value={{ user, checkAuthStatus }}>
      {children}
    </UserContext.Provider>
  )
}

export { useUser }
