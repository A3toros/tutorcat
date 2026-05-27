import { Handler } from '@netlify/functions'
import { neon } from '@neondatabase/serverless'
import { getHeaders } from './cors-headers'

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
    const decoded = jwt.verify(token, jwtSecret) as any
    return decoded.role === 'admin'
  } catch {
    return false
  }
}

export const handler: Handler = async (event) => {
  const headers = getHeaders(event, false)

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' }
  }
  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: false, error: 'Method not allowed' }),
    }
  }

  const isAdmin = await authenticateAdmin(event)
  if (!isAdmin) {
    return {
      statusCode: 401,
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: false, error: 'Admin authentication required' }),
    }
  }

  const url = new URL(event.rawUrl || `http://localhost${event.path}`)
  const lessonId = url.searchParams.get('lessonId')
  if (!lessonId) {
    return {
      statusCode: 400,
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: false, error: 'lessonId is required' }),
    }
  }

  const databaseUrl = process.env.NEON_DATABASE_URL
  if (!databaseUrl) {
    return {
      statusCode: 500,
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: false, error: 'Database configuration error' }),
    }
  }

  try {
    const sql = neon(databaseUrl)

    const [lessonRows, activitiesResult] = await Promise.all([
      sql`
        SELECT * FROM student_lessons WHERE id = ${lessonId}
      `,
      sql`
        SELECT
          sla.id,
          sla.student_lesson_id,
          sla.activity_type,
          sla.activity_order,
          sla.title,
          sla.description,
          sla.estimated_time_seconds,
          sla.content,
          sla.created_at,
          sla.updated_at,
          COALESCE(
            (
              SELECT json_agg(vi ORDER BY vi.sort_order, vi.id)
              FROM student_vocabulary_items vi
              WHERE vi.activity_id = sla.id
            ),
            '[]'
          ) as vocabulary_items,
          COALESCE(
            (
              SELECT json_agg(gi ORDER BY gi.sort_order, gi.id)
              FROM student_grammar_items gi
              WHERE gi.activity_id = sla.id
            ),
            '[]'
          ) as grammar_items,
          COALESCE(
            (
              SELECT json_agg(pi ORDER BY pi.sort_order, pi.id)
              FROM student_poll_items pi
              WHERE pi.activity_id = sla.id
            ),
            '[]'
          ) as poll_items
        FROM student_lesson_activities sla
        WHERE sla.student_lesson_id = ${lessonId} AND sla.active = TRUE
        GROUP BY sla.id, sla.student_lesson_id, sla.activity_type, sla.activity_order,
                 sla.title, sla.description, sla.estimated_time_seconds, sla.content,
                 sla.created_at, sla.updated_at
        ORDER BY sla.activity_order ASC
      `,
    ])

    if (!lessonRows.length) {
      return {
        statusCode: 404,
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: false, error: 'Lesson not found' }),
      }
    }

    const lesson = lessonRows[0]
    const activities = (activitiesResult as Record<string, unknown>[]).map((row) => {
      const next = { ...row }
      for (const key of ['vocabulary_items', 'grammar_items', 'poll_items'] as const) {
        const raw = next[key]
        if (typeof raw === 'string') {
          try {
            next[key] = JSON.parse(raw)
          } catch {
            next[key] = []
          }
        }
      }
      return next
    })

    return {
      statusCode: 200,
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        lesson,
        activities,
      }),
    }
  } catch (error) {
    console.error('admin-get-student-lesson error:', error)
    return {
      statusCode: 500,
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: false,
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
      }),
    }
  }
}

