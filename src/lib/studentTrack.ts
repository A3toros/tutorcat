export function studentLessonListTitle(lesson: {
  lesson_number: number
  topic: string
}): string {
  return `L${lesson.lesson_number} · ${lesson.topic}`
}

export function studentLessonTestHeader(lesson: {
  lesson_number: number
  topic: string
}): string {
  return studentLessonListTitle(lesson)
}
