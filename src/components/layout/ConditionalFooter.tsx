'use client'

import { usePathname } from 'next/navigation'
import { Footer } from './'

export default function ConditionalFooter() {
  const pathname = usePathname()
  const isAdminRoute = pathname.startsWith('/admin')
  const isLessonRoute = pathname.startsWith('/lessons')
  const isDashboardRoute = pathname.startsWith('/dashboard')
  const isStudentRoute =
    pathname.startsWith('/student_dashboard') || pathname.startsWith('/student/')

  // Hide footer on focused lesson flows (platform + student)
  if (isAdminRoute || isLessonRoute || isDashboardRoute || isStudentRoute) {
    return null
  }

  return <Footer />
}
