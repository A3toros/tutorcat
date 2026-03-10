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
  updated_at: string | null;
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
    SELECT id, transcript, status, result_json, error, prompt, cefr_level, min_words, updated_at
    FROM speech_jobs
    WHERE id = ${id}
  `;

  const job = jobRows[0];
  if (!job) {
    // Replication delay: job just created, row not visible yet. Return processing so client retries.
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ status: 'processing' }),
    };
  }

  const row = job as JobRow;

  const ANALYZING_STALE_SECONDS = 30;
  let statusToReturn = row.status;

  // Stuck analyzing: function crashed after setting analyzing but before completing. Reset so a poll can retry.
  if (row.status === 'analyzing' && row.updated_at) {
    const updatedAt = new Date(row.updated_at).getTime();
    const staleThreshold = Date.now() - ANALYZING_STALE_SECONDS * 1000;
    if (updatedAt < staleThreshold) {
      const resetRows = await sql`
        UPDATE speech_jobs
        SET status = 'processing', updated_at = NOW()
        WHERE id = ${id} AND status = 'analyzing'
        RETURNING id
      `;
      if (resetRows.length > 0) {
        console.log('analysis-result: reset stuck analyzing to processing', { id, updated_at: row.updated_at });
        statusToReturn = 'processing';
      }
    }
  }

  // If job is "processing" (or we just reset from stuck analyzing), trigger background analysis.
  if (statusToReturn === 'processing') {
    const baseUrl = process.env.URL || process.env.DEPLOY_PRIME_URL;
    if (baseUrl) {
      const backgroundUrl = `${String(baseUrl).replace(/\/$/, '')}/.netlify/functions/run-speech-analysis-background`;
      try {
        await Promise.race([
          fetch(backgroundUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jobId: id }),
          }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('trigger_timeout')), 5000)),
        ]);
      } catch (err) {
        console.error('analysis-result: failed to trigger background analysis', err);
      }
    }
  }

  // Return current status only. Never return error for "transition failure" or "job not found":
  // - job not found → return processing (client retries; handles replication delay)
  // - processing/analyzing → return that status (client keeps polling)
  // - completed/failed → return result or error
  const payload: Record<string, unknown> = {
    status: statusToReturn,
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
