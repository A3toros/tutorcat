import { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';
import { getHeaders } from './cors-headers';

const SUPABASE_BUCKET = 'tutorcat';
const SIGNED_URL_EXPIRES_SEC = 3600; // 1 hour

export const handler: Handler = async (event) => {
  const headers = { ...getHeaders(event, false), 'Content-Type': 'application/json' };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' } as any;
  }
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers, body: JSON.stringify({ success: false, error: 'Method not allowed' }) } as any;
  }

  const filename = event.queryStringParameters?.filename?.trim();
  if (!filename) {
    return { statusCode: 400, headers, body: JSON.stringify({ success: false, error: 'Missing filename' }) } as any;
  }

  const supabaseUrl = process.env.SUPABASE_URL?.trim();
  const supabaseKey = (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY)?.trim();
  if (!supabaseUrl || !supabaseKey) {
    return { statusCode: 500, headers, body: JSON.stringify({ success: false, error: 'Storage not configured' }) } as any;
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseKey);
    const { data, error } = await supabase.storage
      .from(SUPABASE_BUCKET)
      .createSignedUrl(filename, SIGNED_URL_EXPIRES_SEC);

    if (error || !data?.signedUrl) {
      return { statusCode: 404, headers, body: JSON.stringify({ success: false, error: error?.message || 'Not found' }) } as any;
    }

    return { statusCode: 200, headers, body: JSON.stringify({ success: true, url: data.signedUrl }) } as any;
  } catch (e) {
    console.error('public-get-recording-audio-url error', e);
    return { statusCode: 500, headers, body: JSON.stringify({ success: false, error: (e as Error).message }) } as any;
  }
};

