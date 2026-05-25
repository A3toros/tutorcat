import type {
  StudentActivityCompletePayload,
  StudentLesson,
  StudentLessonActivity,
} from '@/types/student'

export interface StudentActivityProps {
  activity: StudentLessonActivity
  lesson: StudentLesson
  onComplete: (payload: Omit<StudentActivityCompletePayload, 'activityId' | 'activityType' | 'activityOrder'> & {
    score: number
    maxScore: number
  }) => void
}
