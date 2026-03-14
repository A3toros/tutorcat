/**
 * Admin-only: returns audio metadata from Supabase Storage for a speech job.
 * Reads {jobId}.features.JSON (whisper_verbose.duration) so we have duration even when
 * the browser audio element doesn't report it (e.g. streaming or format).
 * GET ?jobId=xxx
 * Returns { success: true, duration: number | null }.
 * @see https://supabase.com/docs/reference/javascript/storage-from-download
 */
import { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_BUCKET = 'tutorcat';
const FEATURES_PATH_SUFFIX = '.features.JSON';

async function authenticateAdmin(event: any): Promise<boolean> {
  try {
    const cookies = event.headers?.cookie || '';
    const tokenCookie = cookies.split(';').find((c: string) => c.trim().startsWith('admin_token='));
    if (!tokenCookie) return false;
    const token = tokenCookie.split('=')[1];
    const jwt = await import('jsonwebtoken');
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) return false;
    const decoded = jwt.verify(token, jwtSecret) as any;
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
    return { statusCode: 405, headers, body: JSON.stringify({ success: false, error: 'Method not allowed' }) } as any;
  }

  const isAdmin = await authenticateAdmin(event);
  if (!isAdmin) {
    return { statusCode: 401, headers, body: JSON.stringify({ success: false, error: 'Admin authentication required' }) } as any;
  }

  const jobId = event.queryStringParameters?.jobId?.trim();
  if (!jobId) {
    return { statusCode: 400, headers, body: JSON.stringify({ success: false, error: 'Missing jobId' }) } as any;
  }

  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SECRET_KEY?.trim();
  if (!url || !key) {
    return { statusCode: 500, headers, body: JSON.stringify({ success: false, error: 'Storage not configured' }) } as any;
  }

  try {
    const supabase = createClient(url, key);
    const path = `${jobId}${FEATURES_PATH_SUFFIX}`;
    const { data, error } = await supabase.storage.from(SUPABASE_BUCKET).download(path);

    if (error || !data) {
      return {
        statusCode: 404,
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: false, error: error?.message || 'Features file not found' }),
      } as any;
    }

    const text = await (data as Blob).text();
    let json: { whisper_verbose?: { duration?: number } };
    try {
      json = JSON.parse(text);
    } catch {
      return {
        statusCode: 200,
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: true, duration: null }),
      } as any;
    }

    const duration = json?.whisper_verbose?.duration;
    const durationSec =
      typeof duration === 'number' && Number.isFinite(duration) && duration >= 0 ? duration : null;

    return {
      statusCode: 200,
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true, duration: durationSec }),
    } as any;
  } catch (e) {
    console.error('admin-get-speech-audio-metadata error', e);
    return {
      statusCode: 500,
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: false, error: (e as Error).message }),
    } as any;
  }
};
