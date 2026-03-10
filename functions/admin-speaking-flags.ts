import { Handler } from '@netlify/functions';
import { neon } from '@neondatabase/serverless';

// Reuse the same admin auth pattern as other admin functions
async function authenticateAdmin(event: any): Promise<boolean> {
  try {
    const cookies = event.headers?.cookie || '';
    const cookieArray = cookies.split(';');
    const tokenCookie = cookieArray.find((c: string) => c.trim().startsWith('admin_token='));

    if (!tokenCookie) return false;

    const token = tokenCookie.split('=')[1];

    const jwt = await import('jsonwebtoken');
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) return false;

    const decoded = jwt.verify(token, jwtSecret) as any;
    return decoded.role === 'admin';
  } catch (error) {
    return false;
  }
}

export const handler: Handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, OPTIONS'
  };

  // CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: ''
    } as any;
  }

  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ success: false, error: 'Method not allowed' })
    } as any;
  }

  try {
    // Check admin authentication
    const isAdmin = await authenticateAdmin(event);
    if (!isAdmin) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ success: false, error: 'Admin authentication required' })
      } as any;
    }

    const databaseUrl = process.env.NEON_DATABASE_URL;
    if (!databaseUrl) {
      console.error('NEON_DATABASE_URL not configured');
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ success: false, error: 'Database configuration error' })
      } as any;
    }

    const sql = neon(databaseUrl);

    const scope = (event.queryStringParameters?.scope || 'lessons').toLowerCase();
    const lessonId = event.queryStringParameters?.lessonId || null;
    const userId = event.queryStringParameters?.userId || null;
    const testId = event.queryStringParameters?.testId || null;

    const page = Math.max(1, parseInt(event.queryStringParameters?.page || '1', 10) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(event.queryStringParameters?.limit || '50', 10) || 50));
    const offset = (page - 1) * limit;

    const [rows, countRows] = await Promise.all([
      sql`
        SELECT
          sj.id,
          sj.user_id,
          u.email as user_email,
          sj.lesson_id,
          sj.transcript,
          sj.status,
          sj.result_json,
          sj.error,
          sj.prompt,
          sj.prompt_id,
          sj.created_at,
          (
            SELECT row_to_json(lar)
            FROM lesson_activity_results lar
            WHERE lar.user_id = sj.user_id
              AND lar.lesson_id = sj.lesson_id
              AND lar.activity_type IN ('speaking_with_feedback', 'speaking_practice')
            ORDER BY lar.completed_at DESC NULLS LAST, lar.id DESC
            LIMIT 1
          ) AS lesson_result
        FROM speech_jobs sj
        LEFT JOIN users u ON sj.user_id = u.id
        WHERE
          1 = 1
          ${lessonId ? sql`AND sj.lesson_id = ${lessonId}` : sql``}
          ${userId ? sql`AND sj.user_id = ${userId}` : sql``}
          ${
            scope === 'evaluation' && testId
              ? sql`AND (sj.lesson_id = ${testId} OR sj.prompt_id ILIKE ${'%' + testId + '%'})`
              : sql``
          }
        ORDER BY
          sj.created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `,
      sql`
        SELECT COUNT(*) as total
        FROM speech_jobs sj
        WHERE
          1 = 1
          ${lessonId ? sql`AND sj.lesson_id = ${lessonId}` : sql``}
          ${userId ? sql`AND sj.user_id = ${userId}` : sql``}
          ${
            scope === 'evaluation' && testId
              ? sql`AND (sj.lesson_id = ${testId} OR sj.prompt_id ILIKE ${'%' + testId + '%'})`
              : sql``
          }
      `
    ]);

    const totalItems = parseInt(countRows[0]?.total as any, 10) || 0;
    const totalPages = Math.max(1, Math.ceil(totalItems / limit));

    const items = rows.map((row: any) => {
      const resultJson = row.result_json || {};
      const integrity = resultJson.integrity || null;
      const lessonResult = row.lesson_result || null;

      return {
        job_id: row.id,
        user_id: row.user_id,
        user_email: row.user_email || null,
        lesson_id: row.lesson_id,
        prompt: row.prompt,
        prompt_id: row.prompt_id,
        transcript: row.transcript,
        status: row.status,
        error: row.error || null,
        integrity,
        lesson_result: lessonResult,
        created_at: row.created_at
      };
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        scope,
        items,
        pagination: {
          page,
          limit,
          total: totalItems,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1
        }
      })
    } as any;
  } catch (error) {
    console.error('admin-speaking-flags error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, error: 'Internal server error' })
    } as any;
  }
};

