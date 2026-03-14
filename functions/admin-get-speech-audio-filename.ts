/**
 * Admin-only: returns the audio file name in Supabase Storage for a speech job.
 * GET ?jobId=xxx
 * Returns { success: true, filename: "uuid.m4a" } or 404 if not found.
 */
import { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_BUCKET = 'tutorcat';
const AUDIO_EXTENSIONS = ['.webm', '.mp4', '.ogg', '.m4a'];

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
    const storage = supabase.storage.from(SUPABASE_BUCKET);

    // Try listV2 with prefix if available (supabase-js 2.11+)
    const listV2 = (storage as any).listV2;
    if (typeof listV2 === 'function') {
      const { data, error } = await listV2.call(storage, { prefix: jobId, limit: 20 });
      if (!error && data?.objects) {
        const names = (data.objects as { name?: string }[]).map((o) => o.name).filter(Boolean) as string[];
        const audioName = names.find((name) =>
          AUDIO_EXTENSIONS.some((ext) => name.toLowerCase().endsWith(ext))
        );
        if (audioName) {
          return {
            statusCode: 200,
            headers: { ...headers, 'Content-Type': 'application/json' },
            body: JSON.stringify({ success: true, filename: audioName }),
          } as any;
        }
      }
    }

    // Fallback: list root and filter by prefix (works for smaller buckets)
    const { data: listData, error: listError } = await storage.list('', { limit: 2000 });
    if (!listError && Array.isArray(listData)) {
      const audioName = listData.find((item: { name?: string }) => {
        const name = item?.name;
        return typeof name === 'string' && name.startsWith(jobId) &&
          AUDIO_EXTENSIONS.some((ext) => name.toLowerCase().endsWith(ext));
      }) as { name: string } | undefined;
      if (audioName?.name) {
        return {
          statusCode: 200,
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ success: true, filename: audioName.name }),
        } as any;
      }
    }

    return {
      statusCode: 404,
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: false, error: 'Audio file not found for this job' }),
    } as any;
  } catch (e) {
    console.error('admin-get-speech-audio-filename error', e);
    return {
      statusCode: 500,
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: false, error: (e as Error).message }),
    } as any;
  }
};
