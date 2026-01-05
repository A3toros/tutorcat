'use client'

import { usePathname } from 'next/navigation'
import { Footer } from './'

export default function ConditionalFooter() {
  const pathname = usePathname()
  const isAdminRoute = pathname.startsWith('/admin')
  const isLessonRoute = pathname.startsWith('/lessons')

  // Don't render footer for admin routes or lesson routes
  if (isAdminRoute || isLessonRoute) {
    return null
  }

  return <Footer />
}
