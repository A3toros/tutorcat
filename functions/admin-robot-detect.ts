import { Handler } from '@netlify/functions';
import { neon } from '@neondatabase/serverless';

async function authenticateAdmin(event: any): Promise<boolean> {
  try {
    const cookies = event.headers?.cookie || '';
    const tokenCookie = cookies.split(';').find((c: string) => c.trim().startsWith('admin_token='));
    if (!tokenCookie) return false;
    const token = tokenCookie.split('=')[1];
    const jwt = await import('jsonwebtoken');
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) return false;
    const decoded = jwt.verify(token, jwtSecret) as { role?: string };
    return decoded.role === 'admin';
  } catch {
    return false;
  }
}

export const handler: Handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' } as any;
  }

  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ success: false, error: 'Method not allowed' }),
    } as any;
  }

  try {
    const isAdmin = await authenticateAdmin(event);
    if (!isAdmin) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ success: false, error: 'Admin authentication required' }),
      } as any;
    }

    const databaseUrl = process.env.NEON_DATABASE_URL;
    if (!databaseUrl) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ success: false, error: 'Database configuration error' }),
      } as any;
    }

    const sql = neon(databaseUrl);

    const userSearch = (event.queryStringParameters?.userSearch || '').trim() || null;
    const onlyWouldFlag = (event.queryStringParameters?.onlyWouldFlag || '') === 'true';
    const onlyScored = (event.queryStringParameters?.onlyScored || 'true') !== 'false';
    const minScoreRaw = parseInt(event.queryStringParameters?.minScore || '0', 10);
    const minScore = Number.isFinite(minScoreRaw) && minScoreRaw >= 0 ? minScoreRaw : 0;
    const sort = (event.queryStringParameters?.sort || 'score_desc').toLowerCase();

    const page = Math.max(1, parseInt(event.queryStringParameters?.page || '1', 10) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(event.queryStringParameters?.limit || '50', 10) || 50));
    const offset = (page - 1) * limit;

    const orderClause =
      sort === 'score_asc'
        ? sql`ORDER BY sj.robotic_voice_score ASC NULLS LAST, sj.created_at DESC`
        : sort === 'created_desc'
          ? sql`ORDER BY sj.created_at DESC`
          : sql`ORDER BY sj.robotic_voice_score DESC NULLS LAST, sj.created_at DESC`;

    const [rows, countRows] = await Promise.all([
      sql`
        SELECT
          sj.id,
          sj.user_id,
          u.email AS user_email,
          u.username AS user_username,
          sj.lesson_id,
          sls.lesson_number AS student_lesson_number,
          sls.topic AS student_lesson_topic,
          sj.transcript,
          sj.status,
          sj.error,
          sj.prompt,
          sj.prompt_id,
          sj.created_at,
          sj.robotic_voice_score,
          sj.robotic_voice_would_flag,
          sj.robotic_voice_flagged,
          sj.robotic_voice_rules,
          sj.result_json->'robotic_voice' AS robotic_voice_detail
        FROM speech_jobs sj
        LEFT JOIN users u ON sj.user_id = u.id
        LEFT JOIN student_lessons sls ON sls.id::text = sj.lesson_id::text
        WHERE 1 = 1
          ${onlyScored ? sql`AND sj.robotic_voice_score IS NOT NULL` : sql``}
          ${onlyWouldFlag ? sql`AND sj.robotic_voice_would_flag = TRUE` : sql``}
          ${minScore > 0 ? sql`AND sj.robotic_voice_score >= ${minScore}` : sql``}
          ${
            userSearch
              ? sql`AND (
                  u.email ILIKE ${'%' + userSearch + '%'}
                  OR u.username ILIKE ${'%' + userSearch + '%'}
                )`
              : sql``
          }
        ${orderClause}
        LIMIT ${limit} OFFSET ${offset}
      `,
      sql`
        SELECT COUNT(*)::int AS total
        FROM speech_jobs sj
        LEFT JOIN users u ON sj.user_id = u.id
        WHERE 1 = 1
          ${onlyScored ? sql`AND sj.robotic_voice_score IS NOT NULL` : sql``}
          ${onlyWouldFlag ? sql`AND sj.robotic_voice_would_flag = TRUE` : sql``}
          ${minScore > 0 ? sql`AND sj.robotic_voice_score >= ${minScore}` : sql``}
          ${
            userSearch
              ? sql`AND (
                  u.email ILIKE ${'%' + userSearch + '%'}
                  OR u.username ILIKE ${'%' + userSearch + '%'}
                )`
              : sql``
          }
      `,
    ]);

    const totalItems = Number(countRows[0]?.total) || 0;
    const totalPages = Math.max(1, Math.ceil(totalItems / limit));

    const items = rows.map((row: Record<string, unknown>) => ({
      job_id: row.id,
      user_id: row.user_id,
      user_email: row.user_email || null,
      user_username: row.user_username || null,
      lesson_id: row.lesson_id,
      student_lesson_number: row.student_lesson_number ?? null,
      student_lesson_topic: row.student_lesson_topic ?? null,
      prompt: row.prompt,
      prompt_id: row.prompt_id,
      transcript: row.transcript,
      status: row.status,
      error: row.error || null,
      created_at: row.created_at,
      robotic_voice_score: row.robotic_voice_score ?? null,
      robotic_voice_would_flag: row.robotic_voice_would_flag ?? null,
      robotic_voice_flagged: row.robotic_voice_flagged ?? null,
      robotic_voice_rules: row.robotic_voice_rules ?? null,
      robotic_voice_detail: row.robotic_voice_detail ?? null,
      signals: (() => {
        const detail = row.robotic_voice_detail as { signals?: Record<string, unknown> } | null
        const s = detail?.signals
        if (!s || typeof s !== 'object') return null
        return {
          scorer_version: s.scorer_version ?? null,
          std_logprob: s.std_logprob ?? null,
          min_logprob: s.min_logprob ?? null,
          logprob_range: s.logprob_range ?? null,
          mean_logprob: s.mean_logprob ?? null,
          boundary_pause_ratio: s.boundary_pause_ratio ?? null,
          energy_autocorr_lag1: s.energy_autocorr_lag1 ?? null,
          energy_autocorr_lag3: s.energy_autocorr_lag3 ?? null,
        }
      })(),
    }));

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        items,
        pagination: {
          page,
          limit,
          total: totalItems,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1,
        },
      }),
    } as any;
  } catch (error) {
    console.error('admin-robot-detect error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, error: 'Internal server error' }),
    } as any;
  }
};
