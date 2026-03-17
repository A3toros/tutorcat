import { Handler } from '@netlify/functions';
import { neon } from '@neondatabase/serverless';
import { getHeaders } from './cors-headers';

function isUuidLike(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export const handler: Handler = async (event) => {
  const headers = { ...getHeaders(event, false), 'Content-Type': 'application/json' };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' } as any;
  }
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers, body: JSON.stringify({ success: false, error: 'Method not allowed' }) } as any;
  }

  const baseKey = event.queryStringParameters?.baseKey?.trim() || '';
  if (!baseKey || !isUuidLike(baseKey)) {
    return { statusCode: 400, headers, body: JSON.stringify({ success: false, error: 'Missing or invalid baseKey' }) } as any;
  }

  const databaseUrl = process.env.NEON_DATABASE_URL;
  if (!databaseUrl) {
    return { statusCode: 500, headers, body: JSON.stringify({ success: false, error: 'Database configuration error' }) } as any;
  }

  try {
    const sql = neon(databaseUrl);
    const rows = await sql`
      SELECT
        id::text,
        transcript,
        status,
        prompt_id,
        user_id::text as user_id,
        result_json
      FROM speech_jobs
      WHERE id = ${baseKey}::uuid
      LIMIT 1
    `;

    const row = (rows as any[])[0];
    if (!row) {
      return { statusCode: 404, headers, body: JSON.stringify({ success: false, error: 'Not found' }) } as any;
    }

    const resultJson = row.result_json && typeof row.result_json === 'object' ? row.result_json : null;
    const improvedTranscript = resultJson?.improved_transcript ?? null;
    const integrity = resultJson?.integrity ?? null;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        baseKey,
        status: row.status ?? null,
        promptId: row.prompt_id ?? null,
        userId: row.user_id ?? null,
        transcript: row.transcript ?? '',
        improvedTranscript: typeof improvedTranscript === 'string' ? improvedTranscript : null,
        integrity,
      }),
    } as any;
  } catch (e) {
    console.error('public-get-recording-transcript error', e);
    return { statusCode: 500, headers, body: JSON.stringify({ success: false, error: (e as Error).message }) } as any;
  }
};

