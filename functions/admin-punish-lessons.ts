import { Handler } from '@netlify/functions'
import { neon } from '@neondatabase/serverless'
import {
  CEFR_LEVELS,
  fetchLessonsInRange,
  parseStudentIdList,
  resolveStudentUsers,
} from './lib/platform-lesson-assignments.js'

async function authenticateAdmin(
  event: any,
  sql: ReturnType<typeof neon>
): Promise<{ ok: true; adminId: string | null } | { ok: false }> {
  try {
    const cookies = event.headers?.cookie || ''
    const tokenCookie = cookies.split(';').find((c: string) => c.trim().startsWith('admin_token='))
    if (!tokenCookie) return { ok: false }
    const token = tokenCookie.split('=')[1]
    const jwt = await import('jsonwebtoken')
    const jwtSecret = process.env.JWT_SECRET
    if (!jwtSecret) return { ok: false }
    const decoded = jwt.verify(token, jwtSecret) as { role?: string; email?: string }
    if (decoded.role !== 'admin') return { ok: false }
    if (decoded.email) {
      const rows = await sql`
        SELECT id FROM users WHERE email = ${decoded.email} AND role = 'admin' LIMIT 1
      `
      return { ok: true, adminId: rows[0]?.id ? String(rows[0].id) : null }
    }
    return { ok: true, adminId: null }
  } catch {
    return { ok: false }
  }
}

export const handler: Handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Content-Type': 'application/json',
  }

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' } as any

  const databaseUrl = process.env.NEON_DATABASE_URL
  if (!databaseUrl) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, error: 'Database configuration error' }),
    } as any
  }

  const sql = neon(databaseUrl)
  const auth = await authenticateAdmin(event, sql)
  if (!auth.ok) {
    return {
      statusCode: 401,
      headers,
      body: JSON.stringify({ success: false, error: 'Admin authentication required' }),
    } as any
  }

  try {
    if (event.httpMethod === 'GET') {
      const previewLevel = event.queryStringParameters?.level
      const previewFrom = parseInt(event.queryStringParameters?.from || '', 10)
      const previewTo = parseInt(event.queryStringParameters?.to || '', 10)

      let previewLessons: unknown[] = []
      if (
        previewLevel &&
        CEFR_LEVELS.includes(previewLevel as (typeof CEFR_LEVELS)[number]) &&
        Number.isFinite(previewFrom) &&
        Number.isFinite(previewTo)
      ) {
        previewLessons = await fetchLessonsInRange(sql, previewLevel, previewFrom, previewTo)
      }

      const rows = await sql`
        SELECT
          u.id AS user_id,
          u.school_student_id,
          u.nickname,
          u.first_name,
          u.last_name,
          COUNT(spla.id)::int AS assignment_count,
          MAX(spla.assigned_at) AS last_assigned_at,
          COALESCE(
            jsonb_agg(
              jsonb_build_object(
                'lesson_id', l.id,
                'level', l.level,
                'lesson_number', l.lesson_number,
                'topic', l.topic,
                'assigned_at', spla.assigned_at
              )
              ORDER BY l.level, l.lesson_number
            ) FILTER (WHERE spla.id IS NOT NULL),
            '[]'::jsonb
          ) AS lessons
        FROM users u
        INNER JOIN student_platform_lesson_assignments spla ON spla.user_id = u.id
        INNER JOIN lessons l ON l.id = spla.lesson_id
        WHERE u.role = 'student'
        GROUP BY u.id, u.school_student_id, u.nickname, u.first_name, u.last_name
        ORDER BY last_assigned_at DESC NULLS LAST
      `

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          levels: CEFR_LEVELS,
          preview_lessons: previewLessons,
          restricted_students: rows,
        }),
      } as any
    }

    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}')
      const studentIds = parseStudentIdList(String(body.student_ids || body.studentIds || ''))
      const level = String(body.level || '').trim()
      const lessonFrom = parseInt(String(body.lesson_from ?? body.lessonFrom ?? ''), 10)
      const lessonTo = parseInt(String(body.lesson_to ?? body.lessonTo ?? ''), 10)
      const notes = typeof body.notes === 'string' ? body.notes.trim() || null : null
      const replace = body.replace === true

      if (!studentIds.length) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ success: false, error: 'At least one student ID is required' }),
        } as any
      }
      if (!CEFR_LEVELS.includes(level as (typeof CEFR_LEVELS)[number])) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ success: false, error: 'Invalid CEFR level' }),
        } as any
      }
      if (!Number.isFinite(lessonFrom) || !Number.isFinite(lessonTo) || lessonFrom < 1 || lessonTo < 1) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ success: false, error: 'Lesson range must be positive integers' }),
        } as any
      }

      const lessons = await fetchLessonsInRange(sql, level, lessonFrom, lessonTo)
      if (!lessons.length) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({
            success: false,
            error: `No platform lessons found for ${level} lessons ${Math.min(lessonFrom, lessonTo)}–${Math.max(lessonFrom, lessonTo)}`,
          }),
        } as any
      }

      const { users, notFound } = await resolveStudentUsers(sql, studentIds)
      if (!users.length) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ success: false, error: 'No matching students found', not_found: notFound }),
        } as any
      }

      let inserted = 0
      for (const user of users) {
        if (replace) {
          await sql`DELETE FROM student_platform_lesson_assignments WHERE user_id = ${user.id}`
        }
        for (const lesson of lessons as Array<{ id: string }>) {
          const result = await sql`
            INSERT INTO student_platform_lesson_assignments (user_id, lesson_id, assigned_by, notes)
            VALUES (${user.id}, ${lesson.id}, ${auth.adminId}, ${notes})
            ON CONFLICT (user_id, lesson_id) DO UPDATE SET
              assigned_by = EXCLUDED.assigned_by,
              assigned_at = NOW(),
              notes = COALESCE(EXCLUDED.notes, student_platform_lesson_assignments.notes)
            RETURNING id
          `
          if (result.length) inserted += 1
        }
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          students: users.map((u) => ({
            id: u.id,
            school_student_id: u.school_student_id,
            nickname: u.nickname,
            name: [u.first_name, u.last_name].filter(Boolean).join(' '),
          })),
          lessons: lessons,
          inserted,
          not_found: notFound,
          replace,
        }),
      } as any
    }

    if (event.httpMethod === 'DELETE') {
      const body = JSON.parse(event.body || '{}')
      const studentIds = parseStudentIdList(String(body.student_ids || body.studentIds || ''))
      if (!studentIds.length) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ success: false, error: 'student_ids required' }),
        } as any
      }

      const { users, notFound } = await resolveStudentUsers(sql, studentIds)
      let removed = 0
      for (const user of users) {
        const result = await sql`
          DELETE FROM student_platform_lesson_assignments WHERE user_id = ${user.id}
          RETURNING id
        `
        removed += result.length
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          cleared_students: users.length,
          removed_assignments: removed,
          not_found: notFound,
        }),
      } as any
    }

    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ success: false, error: 'Method not allowed' }),
    } as any
  } catch (error) {
    console.error('admin-punish-lessons error:', error)
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      }),
    } as any
  }
}
