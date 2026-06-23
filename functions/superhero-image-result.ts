import { Handler } from '@netlify/functions';
import { neon } from '@neondatabase/serverless';
import { getHeaders } from './cors-headers';
import { superheroImageProcessUrl } from './superhero-image-job-runner.js';

const STALE_GENERATING_SECONDS = 90;

const handler: Handler = async (event) => {
  const headers = {
    ...getHeaders(event, true),
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store, no-cache, must-revalidate',
    Pragma: 'no-cache',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ success: false, error: 'Method not allowed' }),
    };
  }

  const id = event.queryStringParameters?.id;
  if (!id) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ success: false, error: 'Missing query parameter: id' }),
    };
  }

  const databaseUrl = process.env.NEON_DATABASE_URL;
  if (!databaseUrl) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, error: 'Database configuration error' }),
    };
  }

  const sql = neon(databaseUrl);
  const jobRows = await sql`
    SELECT id, status, result_json, error, updated_at
    FROM superhero_image_jobs
    WHERE id = ${id}
  `;

  const job = jobRows[0] as
    | {
        id: string;
        status: string;
        result_json: unknown;
        error: string | null;
        updated_at: string | null;
      }
    | undefined;

  if (!job) {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, status: 'processing' }),
    };
  }

  let statusToReturn = job.status;

  if (job.status === 'generating' && job.updated_at) {
    const updatedAt = new Date(job.updated_at).getTime();
    const staleThreshold = Date.now() - STALE_GENERATING_SECONDS * 1000;
    if (updatedAt < staleThreshold) {
      const resetRows = await sql`
        UPDATE superhero_image_jobs
        SET status = 'processing', updated_at = NOW()
        WHERE id = ${id} AND status = 'generating'
        RETURNING id
      `;
      if (resetRows.length > 0) {
        console.log('superhero-image-result: reset stuck generating to processing', { id });
        statusToReturn = 'processing';
      }
    }
  }

  if (statusToReturn === 'processing') {
    const baseUrl = process.env.URL || process.env.DEPLOY_PRIME_URL || 'http://localhost:8888';
    const processUrl = superheroImageProcessUrl(baseUrl);
    try {
      await Promise.race([
        fetch(processUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jobId: id }),
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('trigger_timeout')), 5000)),
      ]);
    } catch (err) {
      console.error('superhero-image-result: failed to trigger worker', err);
    }
  }

  const payload: Record<string, unknown> = {
    success: true,
    status: statusToReturn,
  };
  if (job.result_json != null) payload.data = job.result_json;
  if (job.error != null) payload.error = job.error;

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify(payload),
  };
};

export { handler };
