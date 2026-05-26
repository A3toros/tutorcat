/**
 * Local backup for student lesson progress (used with server saves).
 */

export interface StudentLessonLocalProgress {
  studentLessonId: string
  userId: string
  completedOrders: number[]
  activityIndex: number
  lastSavedAt: string
}

const PREFIX = 'student-lesson-progress'

function key(userId: string, studentLessonId: string) {
  return `${PREFIX}-${userId}-${studentLessonId}`
}

export const studentLessonProgressStorage = {
  save(
    userId: string,
    studentLessonId: string,
    progress: Pick<StudentLessonLocalProgress, 'completedOrders' | 'activityIndex'>
  ) {
    if (typeof window === 'undefined') return
    try {
      const payload: StudentLessonLocalProgress = {
        userId,
        studentLessonId,
        completedOrders: progress.completedOrders,
        activityIndex: progress.activityIndex,
        lastSavedAt: new Date().toISOString(),
      }
      localStorage.setItem(key(userId, studentLessonId), JSON.stringify(payload))
    } catch (e) {
      console.warn('studentLessonProgressStorage.save failed', e)
    }
  },

  load(userId: string, studentLessonId: string): StudentLessonLocalProgress | null {
    if (typeof window === 'undefined') return null
    try {
      const raw = localStorage.getItem(key(userId, studentLessonId))
      if (!raw) return null
      const parsed = JSON.parse(raw) as StudentLessonLocalProgress
      if (parsed.userId !== userId || parsed.studentLessonId !== studentLessonId) return null
      return parsed
    } catch {
      return null
    }
  },

  clear(userId: string, studentLessonId: string) {
    if (typeof window === 'undefined') return
    localStorage.removeItem(key(userId, studentLessonId))
  },
}
