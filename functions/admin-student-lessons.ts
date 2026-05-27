import { Handler } from '@netlify/functions'
import { neon } from '@neondatabase/serverless'

async function authenticateAdmin(event: any): Promise<boolean> {
  try {
    const cookies = event.headers?.cookie || ''
    const tokenCookie = cookies
      .split(';')
      .find((c: string) => c.trim().startsWith('admin_token='))
    if (!tokenCookie) return false
    const token = tokenCookie.split('=')[1]
    const jwt = await import('jsonwebtoken')
    const jwtSecret = process.env.JWT_SECRET
    if (!jwtSecret) return false
    const decoded = jwt.verify(token, jwtSecret) as { role?: string }
    return decoded.role === 'admin'
  } catch {
    return false
  }
}

export const handler: Handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, PATCH, OPTIONS',
    'Content-Type': 'application/json',
  }

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' } as any

  const isAdmin = await authenticateAdmin(event)
  if (!isAdmin) {
    return {
      statusCode: 401,
      headers,
      body: JSON.stringify({ success: false, error: 'Admin authentication required' }),
    } as any
  }

  const databaseUrl = process.env.NEON_DATABASE_URL
  if (!databaseUrl) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, error: 'Database configuration error' }),
    } as any
  }

  const sql = neon(databaseUrl)

  try {
    if (event.httpMethod === 'GET') {
      const rows = await sql`
        SELECT
          sl.id::text as id,
          sl.lesson_number,
          sl.topic,
          sl.slug,
          sl.active,
          sl.live_duration_minutes,
          (
            SELECT COUNT(*)::int
            FROM student_lesson_activities sla
            WHERE sla.student_lesson_id = sl.id AND sla.active = TRUE
          ) as activity_count
        FROM student_lessons sl
        ORDER BY sl.lesson_number ASC
      `

      const lessons = (rows as any[]).map((r) => ({
        id: String(r.id),
        lesson_number: Number(r.lesson_number),
        topic: String(r.topic || ''),
        slug: r.slug ? String(r.slug) : null,
        active: Boolean(r.active),
        live_duration_minutes: r.live_duration_minutes != null ? Number(r.live_duration_minutes) : null,
        activity_count: Number(r.activity_count) || 0,
      }))

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, lessons }),
      } as any
    }

    if (event.httpMethod === 'PATCH') {
      let body: { lessonId?: string; active?: boolean } = {}
      try {
        body = event.body ? JSON.parse(event.body) : {}
      } catch {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ success: false, error: 'Invalid JSON body' }),
        } as any
      }

      const lessonId = typeof body.lessonId === 'string' ? body.lessonId.trim() : ''
      if (!lessonId) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ success: false, error: 'lessonId is required' }),
        } as any
      }
      if (typeof body.active !== 'boolean') {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ success: false, error: 'active (boolean) is required' }),
        } as any
      }

      const updated = await sql`
        UPDATE student_lessons
        SET active = ${body.active}, updated_at = NOW(), last_modified_at = NOW()
        WHERE id = ${lessonId}::uuid
        RETURNING
          id::text as id,
          lesson_number,
          topic,
          slug,
          active,
          live_duration_minutes
      `

      if (!updated.length) {
        return {
          statusCode: 404,
          headers,
          body: JSON.stringify({ success: false, error: 'Lesson not found' }),
        } as any
      }

      const row = updated[0] as any
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          lesson: {
            id: String(row.id),
            lesson_number: Number(row.lesson_number),
            topic: String(row.topic || ''),
            slug: row.slug ? String(row.slug) : null,
            active: Boolean(row.active),
            live_duration_minutes:
              row.live_duration_minutes != null ? Number(row.live_duration_minutes) : null,
          },
        }),
      } as any
    }

    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ success: false, error: 'Method not allowed' }),
    } as any
  } catch (e) {
    console.error('admin-student-lessons error', e)
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, error: (e as Error).message }),
    } as any
  }
}
