/**
 * Long-running portrait worker (900s). Used in netlify dev instead of background functions,
 * which can exit before image edit finishes. Production may use background via filename suffix.
 */
import { Handler } from '@netlify/functions';
import { getHeaders } from './cors-headers';
import { processSuperheroImageJob } from './superhero-image-job-runner.js';

const handler: Handler = async (event) => {
  const headers = getHeaders(event, true);

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  let jobId: string | undefined;
  try {
    const body = JSON.parse(event.body || '{}') as { jobId?: string };
    jobId = typeof body.jobId === 'string' ? body.jobId.trim() : undefined;
  } catch {
    return {
      statusCode: 400,
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Invalid JSON' }),
    };
  }

  if (!jobId) {
    return {
      statusCode: 400,
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Missing jobId' }),
    };
  }

  const outcome = await processSuperheroImageJob(jobId);

  return {
    statusCode: outcome === 'skipped' || outcome === 'lost_race' ? 200 : outcome === 'completed' ? 200 : 500,
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ok: true, outcome }),
  };
};

export { handler };
