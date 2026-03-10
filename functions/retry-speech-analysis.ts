import { Handler } from '@netlify/functions';
import { neon } from '@neondatabase/serverless';

const corsHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface RetryBody {
  transcript: string;
  prompt: string;
  prompt_id?: string;
  cefr_level?: string;
  min_words?: number;
  user_id?: string;
  lesson_id?: string;
}

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  let body: RetryBody;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Invalid JSON payload' }),
    };
  }

  if (!body.prompt || typeof body.prompt !== 'string' || !body.prompt.trim()) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Missing prompt' }),
    };
  }

  if (!body.transcript || typeof body.transcript !== 'string' || !body.transcript.trim()) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Missing transcript' }),
    };
  }

  const databaseUrl = process.env.NEON_DATABASE_URL;
  if (!databaseUrl) {
    console.error('NEON_DATABASE_URL not configured');
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Database configuration error' }),
    };
  }

  const sql = neon(databaseUrl);
  const minWords = typeof body.min_words === 'number' ? body.min_words : null;
  const lessonId = typeof body.lesson_id === 'string' && body.lesson_id.trim() ? body.lesson_id.trim() : null;

  const rows = await sql`
    INSERT INTO speech_jobs (user_id, lesson_id, transcript, status, prompt, prompt_id, cefr_level, min_words, updated_at)
    VALUES (${body.user_id || null}, ${lessonId}, ${body.transcript.trim()}, 'processing', ${body.prompt.trim()}, ${body.prompt_id || null}, ${body.cefr_level || null}, ${minWords}, NOW())
    RETURNING id
  `;

  const row = rows[0];
  if (!row) {
    console.error('speech_jobs insert returned no row');
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Failed to create job' }),
    };
  }

  const jobId = row.id;
  const baseUrl = process.env.URL || process.env.DEPLOY_PRIME_URL || 'http://localhost:8888';
  const backgroundUrl = `${baseUrl.replace(/\/$/, '')}/.netlify/functions/run-speech-analysis-background`;

  let triggerOk = false;
  try {
    const res = await Promise.race([
      fetch(backgroundUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId }),
      }),
      new Promise<Response>((_, reject) =>
        setTimeout(() => reject(new Error('Background trigger timeout')), 8000)
      ),
    ]);
    triggerOk = res.ok;
  } catch (err) {
    console.error('Failed to trigger background analysis:', err);
  }

  if (!triggerOk) {
    await sql`
      UPDATE speech_jobs
      SET status = 'failed', error = 'Analysis could not be started. Please try again.', updated_at = NOW()
      WHERE id = ${jobId}
    `;
    return {
      statusCode: 503,
      headers: corsHeaders,
      body: JSON.stringify({
        error: 'Analysis could not be started. Please try again.',
        jobId,
        status: 'failed',
      }),
    };
  }

  return {
    statusCode: 200,
    headers: corsHeaders,
    body: JSON.stringify({
      jobId,
      status: 'processing',
    }),
  };
};
