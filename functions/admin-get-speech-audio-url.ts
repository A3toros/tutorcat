/**
 * Admin-only: returns a signed Supabase Storage URL for a speech job's audio file.
 * GET ?jobId=xxx
 * Audio is stored as {jobId}.webm (or .mp4, .ogg, .m4a). We try extensions in order and return the first signed URL.
 * Client should try loading the URL; if 404, they can show "Audio not found".
 */
import { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_BUCKET = 'tutorcat';
const AUDIO_EXTENSIONS = ['.webm', '.mp4', '.ogg', '.m4a'];
const SIGNED_URL_EXPIRES_SEC = 3600; // 1 hour

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
    // Create signed URLs for each possible extension; client will try in order until one loads.
    const urls: string[] = [];
    for (const ext of AUDIO_EXTENSIONS) {
      const path = `${jobId}${ext}`;
      const { data: signData, error: signError } = await supabase.storage
        .from(SUPABASE_BUCKET)
        .createSignedUrl(path, SIGNED_URL_EXPIRES_SEC);
      if (!signError && signData?.signedUrl) urls.push(signData.signedUrl);
    }
    if (urls.length === 0) {
      return {
        statusCode: 404,
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: false, error: 'Could not create signed URL for any audio format' }),
      } as any;
    }
    return {
      statusCode: 200,
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true, url: urls[0], urls }),
    } as any;
  } catch (e) {
    console.error('admin-get-speech-audio-url error', e);
    return {
      statusCode: 500,
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: false, error: (e as Error).message }),
    } as any;
  }
};
