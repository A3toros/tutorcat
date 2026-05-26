import { STUDENT_DASHBOARD_PATH } from '@/lib/studentRoutes'
import type { User } from '@/types'

/** Post-login or role-based home URL (mirrors admin → /admin/dashboard). */
export function getHomePathForRole(role: string | undefined | null): string {
  if (role === 'admin') return '/admin/dashboard'
  if (role === 'student') return STUDENT_DASHBOARD_PATH
  return '/dashboard'
}

export function redirectToRoleHome(user: Pick<User, 'role'> | null | undefined): void {
  if (typeof window === 'undefined') return
  window.location.href = getHomePathForRole(user?.role)
}
