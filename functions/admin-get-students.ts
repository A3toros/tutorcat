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
    const decoded = jwt.verify(token, jwtSecret) as any
    return decoded.role === 'admin'
  } catch {
    return false
  }
}

const CLASS_1_15 = [
  '52439',
  '52440',
  '52441',
  '52442',
  '52443',
  '52444',
  '52445',
  '52446',
  '52447',
  '52448',
  '52449',
  '52450',
  '52451',
  '52452',
  '52453',
]

const CLASS_1_16 = [
  '52454',
  '52455',
  '52456',
  '52457',
  '52458',
  '52459',
  '52460',
  '52461',
  '52462',
  '52463',
  '52464',
  '52465',
  '52466',
  '52467',
  '52468',
  '52469',
  '52470',
]

function classLabelForSchoolId(sid: string | null | undefined): '1/15' | '1/16' | null {
  if (!sid) return null
  if (CLASS_1_15.includes(sid)) return '1/15'
  if (CLASS_1_16.includes(sid)) return '1/16'
  return null
}

export const handler: Handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json',
  }

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' } as any
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers, body: JSON.stringify({ success: false, error: 'Method not allowed' }) } as any
  }

  const isAdmin = await authenticateAdmin(event)
  if (!isAdmin) {
    return { statusCode: 401, headers, body: JSON.stringify({ success: false, error: 'Admin authentication required' }) } as any
  }

  const databaseUrl = process.env.NEON_DATABASE_URL
  if (!databaseUrl) {
    return { statusCode: 500, headers, body: JSON.stringify({ success: false, error: 'Database configuration error' }) } as any
  }

  try {
    const sql = neon(databaseUrl)
    const wantedIds = [...CLASS_1_15, ...CLASS_1_16]

    const students = await sql`
      SELECT
        u.id::text as id,
        u.school_student_id as school_student_id,
        u.nickname as nickname
      FROM users u
      WHERE u.role = 'student'
        AND u.school_student_id = ANY(${wantedIds}::text[])
      ORDER BY u.school_student_id ASC
    `

    const studentIds = students.map((s: any) => s.id).filter(Boolean)
    const lessonRows =
      studentIds.length === 0
        ? []
        : await sql`
            SELECT
              sup.user_id::text as user_id,
              sl.id::text as lesson_id,
              sl.lesson_number,
              sl.topic,
              COALESCE(sup.completed, FALSE) as completed,
              COALESCE(sup.score, 0) as score,
              (
                SELECT COALESCE(SUM(sar.max_score), 0)::int
                FROM student_lesson_activity_results sar
                WHERE sar.user_id = sup.user_id
                  AND sar.student_lesson_id = sl.id
              ) as max_score_total,
              sup.completed_at
            FROM student_lessons sl
            LEFT JOIN student_user_progress sup
              ON sup.student_lesson_id = sl.id
            WHERE sup.user_id = ANY(${studentIds}::uuid[])
            ORDER BY sl.lesson_number ASC
          `

    const speechCounts =
      studentIds.length === 0
        ? []
        : await sql`
            SELECT user_id::text as user_id, COUNT(*)::int as speech_jobs
            FROM speech_jobs
            WHERE user_id = ANY(${studentIds}::uuid[])
            GROUP BY user_id
          `
    const speechByUser = new Map<string, number>()
    for (const r of speechCounts as any[]) speechByUser.set(r.user_id, Number(r.speech_jobs) || 0)

    const lessonsByUser = new Map<string, any[]>()
    for (const row of lessonRows as any[]) {
      const userId = String(row.user_id)
      const maxTotal = Number(row.max_score_total) || 0
      const score = Number(row.score) || 0
      const pct = maxTotal > 0 ? Math.round((score / maxTotal) * 100) : 100
      const item = {
        lesson_id: String(row.lesson_id),
        lesson_number: Number(row.lesson_number),
        topic: row.topic,
        completed: Boolean(row.completed),
        score_total: score,
        score_percentage: pct,
        completed_at: row.completed_at,
      }
      const arr = lessonsByUser.get(userId) || []
      arr.push(item)
      lessonsByUser.set(userId, arr)
    }

    const payload = (students as any[]).map((s) => {
      const sid = s.school_student_id ? String(s.school_student_id) : null
      const cls = classLabelForSchoolId(sid)
      return {
        id: String(s.id),
        school_student_id: sid,
        nickname: s.nickname ? String(s.nickname) : '',
        class: cls,
        speech_jobs: speechByUser.get(String(s.id)) ?? 0,
        lessons: (lessonsByUser.get(String(s.id)) || []).filter((l) => l.completed),
      }
    })

    return { statusCode: 200, headers, body: JSON.stringify({ success: true, students: payload }) } as any
  } catch (e) {
    console.error('admin-get-students error', e)
    return { statusCode: 500, headers, body: JSON.stringify({ success: false, error: (e as Error).message }) } as any
  }
}

