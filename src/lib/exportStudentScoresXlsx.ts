import * as XLSX from 'xlsx'

export type ExportStudentLesson = {
  lesson_number: number
  score_percentage: number
  completed: boolean
}

export type ExportStudentRow = {
  school_student_id: string | null
  nickname: string
  lessons: ExportStudentLesson[]
}

/** Map final lesson score (0–100%) to 0–10; unfinished lessons export as 0. */
export function lessonScoreToScale10(lesson: ExportStudentLesson | undefined): number {
  if (!lesson || !lesson.completed) return 0
  return Math.min(10, Math.max(0, Math.round(lesson.score_percentage / 10)))
}

export function buildStudentScoreSheetRows(
  students: ExportStudentRow[],
  lessonNumbers: number[]
): (string | number)[][] {
  const header: (string | number)[] = [
    'ID',
    'Nick',
    ...lessonNumbers.map((n) => `Lesson ${n}`),
  ]

  const rows = students.map((student) => {
    const byLessonNumber = new Map(student.lessons.map((l) => [l.lesson_number, l]))
    return [
      student.school_student_id || '',
      student.nickname || '',
      ...lessonNumbers.map((n) => lessonScoreToScale10(byLessonNumber.get(n))),
    ]
  })

  return [header, ...rows]
}

export function exportStudentScoresWorkbook(opts: {
  class115: ExportStudentRow[]
  class116: ExportStudentRow[]
  lessonNumbers: number[]
  filename?: string
}): void {
  const workbook = XLSX.utils.book_new()

  const sheet115 = XLSX.utils.aoa_to_sheet(
    buildStudentScoreSheetRows(opts.class115, opts.lessonNumbers)
  )
  const sheet116 = XLSX.utils.aoa_to_sheet(
    buildStudentScoreSheetRows(opts.class116, opts.lessonNumbers)
  )

  XLSX.utils.book_append_sheet(workbook, sheet115, '1_15')
  XLSX.utils.book_append_sheet(workbook, sheet116, '1_16')

  const filename =
    opts.filename || `student-scores-${new Date().toISOString().slice(0, 10)}.xlsx`
  XLSX.writeFile(workbook, filename)
}
