import { Handler } from '@netlify/functions';
import { neon } from '@neondatabase/serverless';

async function authenticateAdmin(event: { headers?: { cookie?: string } }): Promise<{
  ok: boolean;
  adminUserId?: string;
}> {
  try {
    const cookies = event.headers?.cookie || '';
    const tokenCookie = cookies.split(';').find((c: string) => c.trim().startsWith('admin_token='));
    if (!tokenCookie) return { ok: false };
    const token = tokenCookie.split('=')[1];
    const jwt = await import('jsonwebtoken');
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) return { ok: false };
    const decoded = jwt.verify(token, jwtSecret) as { role?: string; userId?: string; id?: string };
    if (decoded.role !== 'admin') return { ok: false };
    return { ok: true, adminUserId: decoded.userId || decoded.id };
  } catch {
    return { ok: false };
  }
}

const DELIVERY_METHODS = new Set([
  'human_mic',
  'google_translate_tts',
  'ai_voice_tts',
  'speaker_playback',
]);

const corsHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }

  const auth = await authenticateAdmin(event);
  if (!auth.ok) {
    return {
      statusCode: 401,
      headers: corsHeaders,
      body: JSON.stringify({ success: false, error: 'Admin authentication required' }),
    };
  }

  const databaseUrl = process.env.NEON_DATABASE_URL;
  if (!databaseUrl) {
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ success: false, error: 'Database configuration error' }),
    };
  }

  const sql = neon(databaseUrl);

  if (event.httpMethod === 'GET') {
    try {
      const limit = Math.min(50, Math.max(1, parseInt(event.queryStringParameters?.limit || '20', 10) || 20));
      const rows = await sql`
        SELECT
          s.id,
          s.admin_user_id,
          u.email AS admin_email,
          s.topic_id,
          s.topic_title,
          s.delivery_method,
          s.job_ids,
          s.transcripts,
          s.notes,
          s.created_at,
          (
            SELECT json_agg(job_row ORDER BY ord)
            FROM (
              SELECT
                ids.ord,
                json_build_object(
                  'job_id', sj.id,
                  'robotic_voice_score', sj.robotic_voice_score,
                  'robotic_voice_would_flag', sj.robotic_voice_would_flag,
                  'robotic_voice_rules', sj.robotic_voice_rules,
                  'scorer_version', sj.result_json->'robotic_voice'->'signals'->>'scorer_version',
                  'score_skip_reason', sj.result_json->'robotic_voice'->'signals'->>'score_skip_reason',
                  'logprob_is_artifact', (sj.result_json->'robotic_voice'->'signals'->>'logprob_is_artifact')::boolean,
                  'status', sj.status,
                  'prompt', sj.prompt,
                  'prompt_id', sj.prompt_id
                ) AS job_row
              FROM speech_jobs sj
              INNER JOIN (
                SELECT ordinality AS ord, value::text AS job_id
                FROM jsonb_array_elements_text(COALESCE(s.job_ids, '[]'::jsonb)) WITH ORDINALITY AS t(value, ordinality)
              ) ids ON sj.id::text = ids.job_id
            ) sub
          ) AS jobs
        FROM admin_tts_check_sessions s
        LEFT JOIN users u ON u.id = s.admin_user_id
        ORDER BY s.created_at DESC
        LIMIT ${limit}
      `;

      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ success: true, sessions: rows }),
      };
    } catch (error) {
      console.error('admin-tts-check-session GET error:', error);
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({ success: false, error: 'Internal server error' }),
      };
    }
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ success: false, error: 'Method not allowed' }),
    };
  }

  try {
    let body: {
      topic_id?: string;
      topic_title?: string;
      delivery_method?: string;
      job_ids?: string[];
      transcripts?: Record<string, string>;
      feedback?: Record<string, unknown>;
      notes?: string;
      admin_user_id?: string;
    };
    body = JSON.parse(event.body || '{}');

    const topicId = (body.topic_id || '').trim();
    const topicTitle = (body.topic_title || '').trim();
    const deliveryMethod = (body.delivery_method || '').trim();
    const jobIds = [...new Set(
      (Array.isArray(body.job_ids) ? body.job_ids : [])
        .filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
        .map((id) => id.trim())
    )];

    if (!topicId || !topicTitle) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ success: false, error: 'topic_id and topic_title are required' }),
      };
    }
    if (!DELIVERY_METHODS.has(deliveryMethod)) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ success: false, error: 'Invalid delivery_method' }),
      };
    }
    if (jobIds.length === 0) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ success: false, error: 'At least one job_id is required' }),
      };
    }

    const transcripts = body.transcripts && typeof body.transcripts === 'object' ? body.transcripts : {};
    const feedback = body.feedback && typeof body.feedback === 'object' ? body.feedback : {};
    const notes = typeof body.notes === 'string' ? body.notes.trim() || null : null;
    const adminUserId =
      typeof body.admin_user_id === 'string' && body.admin_user_id.trim()
        ? body.admin_user_id.trim()
        : auth.adminUserId || null;

    const rows = await sql`
      INSERT INTO admin_tts_check_sessions (
        admin_user_id,
        topic_id,
        topic_title,
        delivery_method,
        job_ids,
        transcripts,
        feedback,
        notes
      )
      VALUES (
        ${adminUserId},
        ${topicId},
        ${topicTitle},
        ${deliveryMethod},
        ${JSON.stringify(jobIds)}::jsonb,
        ${JSON.stringify(transcripts)}::jsonb,
        ${JSON.stringify(feedback)}::jsonb,
        ${notes}
      )
      RETURNING id, created_at
    `;

    const row = rows[0];
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        session_id: row?.id,
        created_at: row?.created_at,
      }),
    };
  } catch (error) {
    console.error('admin-tts-check-session POST error:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ success: false, error: 'Internal server error' }),
    };
  }
};
