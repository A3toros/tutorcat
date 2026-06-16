import type {
  StudentActivityCompletePayload,
  StudentActivityResult,
  StudentLesson,
  StudentLessonActivity,
} from '@/types/student'

export interface StudentActivityProps {
  activity: StudentLessonActivity
  lesson: StudentLesson
  /** Prior saved activity results in this lesson (for story / description activities). */
  activityResults?: StudentActivityResult[]
  activities?: StudentLessonActivity[]
  onComplete: (payload: Omit<StudentActivityCompletePayload, 'activityId' | 'activityType' | 'activityOrder'> & {
    score: number
    maxScore: number
  }) => void
}
