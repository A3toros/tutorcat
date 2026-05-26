'use client'

import { useEffect } from 'react'
import { STUDENT_DASHBOARD_PATH } from '@/lib/studentRoutes'

/** Legacy URL → canonical student home */
export default function StudentDashboardRedirect() {
  useEffect(() => {
    window.location.replace(STUDENT_DASHBOARD_PATH)
  }, [])

  return null
}
