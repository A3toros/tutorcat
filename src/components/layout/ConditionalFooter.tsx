'use client'

import { usePathname } from 'next/navigation'
import { Footer } from './'

export default function ConditionalFooter() {
  const pathname = usePathname()
  const isAdminRoute = pathname.startsWith('/admin')
  const isLessonRoute = pathname.startsWith('/lessons')
  const isDashboardRoute = pathname.startsWith('/dashboard')
  const isStudentLessonRoute = pathname.startsWith('/student/lessons')

  // Hide footer on focused lesson flows (platform + student)
  if (isAdminRoute || isLessonRoute || isDashboardRoute || isStudentLessonRoute) {
    return null
  }

  return <Footer />
}
