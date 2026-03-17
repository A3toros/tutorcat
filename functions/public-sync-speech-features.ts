import { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';
import { neon } from '@neondatabase/serverless';
import { getHeaders } from './cors-headers';

const SUPABASE_BUCKET = 'tutorcat';

function isUuidLike(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export const handler: Handler = async (event) => {
  const headers = { ...getHeaders(event, false), 'Content-Type': 'application/json' };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' } as any;
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ success: false, error: 'Method not allowed' }) } as any;
  }

  let body: any = {};
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ success: false, error: 'Invalid JSON payload' }) } as any;
  }

  const baseKey = typeof body.baseKey === 'string' ? body.baseKey.trim() : '';
  if (!baseKey || !isUuidLike(baseKey)) {
    return { statusCode: 400, headers, body: JSON.stringify({ success: false, error: 'Missing or invalid baseKey' }) } as any;
  }

  const supabaseUrl = process.env.SUPABASE_URL?.trim();
  const supabaseKey = (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY)?.trim();
  if (!supabaseUrl || !supabaseKey) {
    return { statusCode: 500, headers, body: JSON.stringify({ success: false, error: 'Storage not configured' }) } as any;
  }

  const databaseUrl = process.env.NEON_DATABASE_URL;
  if (!databaseUrl) {
    return { statusCode: 500, headers, body: JSON.stringify({ success: false, error: 'Database configuration error' }) } as any;
  }

  const storageFilename = `${baseKey}.features.JSON`;

  try {
    const supabase = createClient(supabaseUrl, supabaseKey);
    const { data, error } = await supabase.storage.from(SUPABASE_BUCKET).download(storageFilename);
    if (error || !data) {
      return { statusCode: 404, headers, body: JSON.stringify({ success: false, error: error?.message || 'Features file not found' }) } as any;
    }

    const text = await (data as Blob).text();
    let payload: any;
    try {
      payload = JSON.parse(text);
    } catch {
      return { statusCode: 400, headers, body: JSON.stringify({ success: false, error: 'Invalid JSON file' }) } as any;
    }

    const sql = neon(databaseUrl);
    await sql`
      INSERT INTO classifier_store (key, kind, payload, updated_at)
      VALUES (
        ${`read_vs_speak:recording:${baseKey}`},
        'recording',
        ${JSON.stringify({ storage_filename: storageFilename, features: payload })}::jsonb,
        NOW()
      )
      ON CONFLICT (key) DO UPDATE SET
        payload = EXCLUDED.payload,
        updated_at = NOW()
    `;

    return { statusCode: 200, headers, body: JSON.stringify({ success: true }) } as any;
  } catch (e) {
    console.error('public-sync-speech-features error', e);
    return { statusCode: 500, headers, body: JSON.stringify({ success: false, error: (e as Error).message }) } as any;
  }
};

