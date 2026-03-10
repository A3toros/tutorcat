import { Handler } from '@netlify/functions';
import { neon } from '@neondatabase/serverless';

const corsHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Cache-Control': 'no-store, no-cache, must-revalidate',
  'Pragma': 'no-cache',
};

type JobRow = {
  id: string;
  transcript: string;
  status: string;
  result_json: unknown;
  error: string | null;
  prompt: string | null;
  cefr_level: string | null;
  min_words: number | null;
};

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }

  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  const id = event.queryStringParameters?.id;
  if (!id) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Missing query parameter: id' }),
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

  const jobRows = await sql`
    SELECT id, transcript, status, result_json, error, prompt, cefr_level, min_words
    FROM speech_jobs
    WHERE id = ${id}
  `;

  const job = jobRows[0];
  if (!job) {
    return {
      statusCode: 404,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Job not found', status: 'not_found' }),
    };
  }

  const row = job as JobRow;

  // If job is still "processing", the initial trigger from speech-job may have failed.
  // Re-trigger the background analysis so the job can complete. The background function
  // uses WHERE status = 'processing', so only one runner will do the work.
  if (row.status === 'processing') {
    const baseUrl = process.env.URL || process.env.DEPLOY_PRIME_URL;
    if (baseUrl) {
      const backgroundUrl = `${String(baseUrl).replace(/\/$/, '')}/.netlify/functions/run-speech-analysis-background`;
      fetch(backgroundUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId: id }),
      }).catch((err) => console.error('analysis-result: failed to trigger background analysis', err));
    }
  }

  const payload: Record<string, unknown> = {
    status: row.status,
    transcript: row.transcript || undefined,
  };
  if (row.result_json != null) payload.result = row.result_json;
  if (row.error != null) payload.error = row.error;

  return {
    statusCode: 200,
    headers: corsHeaders,
    body: JSON.stringify(payload),
  };
};
