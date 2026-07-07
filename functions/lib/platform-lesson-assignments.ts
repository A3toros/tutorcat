import { neon } from '@neondatabase/serverless'

export const CEFR_LEVELS = ['Pre-A1', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const
export type CefrLevel = (typeof CEFR_LEVELS)[number]

export function parseStudentIdList(raw: string): string[] {
  return [...new Set(raw.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean))]
}

export async function resolveStudentUsers(
  sql: ReturnType<typeof neon>,
  ids: string[]
): Promise<{
  users: Array<{
    id: string
    school_student_id: string | null
    nickname: string | null
    first_name: string | null
    last_name: string | null
  }>
  notFound: string[]
}> {
  const users: Array<{
    id: string
    school_student_id: string | null
    nickname: string | null
    first_name: string | null
    last_name: string | null
  }> = []
  const notFound: string[] = []

  for (const token of ids) {
    const bySchool = await sql`
      SELECT id, school_student_id, nickname, first_name, last_name
      FROM users
      WHERE role = 'student' AND school_student_id = ${token}
      LIMIT 1
    `
    if (bySchool.length) {
      users.push(bySchool[0] as (typeof users)[number])
      continue
    }

    const byUuid = await sql`
      SELECT id, school_student_id, nickname, first_name, last_name
      FROM users
      WHERE role = 'student' AND id::text = ${token}
      LIMIT 1
    `
    if (byUuid.length) {
      users.push(byUuid[0] as (typeof users)[number])
      continue
    }

    notFound.push(token)
  }

  const seen = new Set<string>()
  const deduped = users.filter((u) => {
    if (seen.has(u.id)) return false
    seen.add(u.id)
    return true
  })

  return { users: deduped, notFound }
}

export async function fetchLessonsInRange(
  sql: ReturnType<typeof neon>,
  level: string,
  lessonFrom: number,
  lessonTo: number
) {
  const from = Math.min(lessonFrom, lessonTo)
  const to = Math.max(lessonFrom, lessonTo)
  return sql`
    SELECT id, level, lesson_number, topic
    FROM lessons
    WHERE level = ${level}
      AND lesson_number >= ${from}
      AND lesson_number <= ${to}
    ORDER BY lesson_number ASC
  `
}

export async function studentPlatformAssignmentCount(
  sql: ReturnType<typeof neon>,
  userId: string
): Promise<number> {
  const rows = await sql`
    SELECT COUNT(*)::int AS c
    FROM student_platform_lesson_assignments
    WHERE user_id = ${userId}
  `
  return Number((rows[0] as { c?: number })?.c) || 0
}

export type PlatformAssignmentLesson = {
  id: string
  lesson_number: number
  topic: string
  level: string
  completed: boolean
  score: number
  progress_percentage: number
  score_percentage: number | null
}

/** Assigned platform lessons in sequence (level, then lesson number). */
export async function fetchStudentPlatformAssignmentLessons(
  sql: ReturnType<typeof neon>,
  userId: string
): Promise<PlatformAssignmentLesson[]> {
  const platformRows = await sql`
    WITH lesson_activity_counts AS (
      SELECT la.lesson_id, COUNT(*)::int AS total
      FROM lesson_activities la
      WHERE la.active = TRUE
      GROUP BY la.lesson_id
    ),
    user_completed_counts AS (
      SELECT lar.lesson_id, COUNT(DISTINCT lar.activity_order)::int AS completed
      FROM lesson_activity_results lar
      WHERE lar.user_id = ${userId}
      GROUP BY lar.lesson_id
    )
    SELECT
      l.id,
      l.level,
      l.lesson_number,
      l.topic,
      COALESCE(up.completed, FALSE) AS completed,
      COALESCE(up.score, 0) AS score,
      COALESCE(lac.total, 0) AS activity_count,
      COALESCE(ucc.completed, 0) AS completed_activity_count
    FROM student_platform_lesson_assignments spla
    INNER JOIN lessons l ON l.id = spla.lesson_id
    LEFT JOIN user_progress up ON up.lesson_id = l.id AND up.user_id = ${userId}
    LEFT JOIN lesson_activity_counts lac ON lac.lesson_id = l.id
    LEFT JOIN user_completed_counts ucc ON ucc.lesson_id = l.id
    WHERE spla.user_id = ${userId}
    ORDER BY l.level ASC, l.lesson_number ASC
  `

  return (platformRows as Array<Record<string, unknown>>).map((row) => {
    const activityCount = Number(row.activity_count) || 0
    const completedCount = Number(row.completed_activity_count) || 0
    const completed = Boolean(row.completed)
    const progressPct =
      activityCount > 0 ? Math.min(100, Math.round((completedCount / activityCount) * 100)) : 0
    return {
      id: String(row.id),
      lesson_number: Number(row.lesson_number),
      topic: String(row.topic || ''),
      level: String(row.level || ''),
      completed,
      score: Number(row.score) || 0,
      progress_percentage: completed ? 100 : progressPct,
      score_percentage: completed ? Number(row.score) || null : null,
    }
  })
}

/** Next incomplete assigned lesson (main-app style — one at a time). */
export function pickCurrentPlatformLesson(
  lessons: PlatformAssignmentLesson[]
): PlatformAssignmentLesson | null {
  return lessons.find((l) => !l.completed) ?? null
}

/** Current lesson or any completed lesson (review). Blocks skipping ahead. */
export async function studentCanAccessAssignedPlatformLesson(
  sql: ReturnType<typeof neon>,
  userId: string,
  lessonId: string
): Promise<boolean> {
  const lessons = await fetchStudentPlatformAssignmentLessons(sql, userId)
  const target = lessons.find((l) => l.id === lessonId)
  if (!target) return false
  if (target.completed) return true
  const current = pickCurrentPlatformLesson(lessons)
  return current?.id === lessonId
}
