/**
 * GET /speech-jobs-by-lesson?lesson_id=A1-L1
 * Returns completed speech jobs for the authenticated user and lesson, for restoring
 * transcript/feedback when loading from another device (no localStorage/IndexedDB).
 */
import { Handler } from '@netlify/functions';
import { neon } from '@neondatabase/serverless';
import { validateJWT, extractTokenFromCookies } from './auth-validate-jwt.js';

const corsHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
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

  const lessonId = event.queryStringParameters?.lesson_id?.trim();
  if (!lessonId) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Missing query parameter: lesson_id' }),
    };
  }

  const cookies = event.headers?.cookie || '';
  const authHeader = event.headers?.authorization || event.headers?.Authorization;
  const token =
    (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
      ? authHeader.slice(7).trim()
      : null) || extractTokenFromCookies(cookies);

  if (!token) {
    return {
      statusCode: 401,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Authentication required' }),
    };
  }

  const auth = await validateJWT(token);
  if (!auth.isValid || !auth.user) {
    return {
      statusCode: 401,
      headers: corsHeaders,
      body: JSON.stringify({ error: auth.error || 'Invalid authentication' }),
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
  const userId = auth.user.id;

  const rows = await sql`
    SELECT id, prompt_id, transcript, status, result_json, error, created_at
    FROM speech_jobs
    WHERE user_id = ${userId} AND lesson_id = ${lessonId}
    ORDER BY created_at DESC
    LIMIT 100
  `;

  const jobs = rows.map((row: any) => ({
    id: row.id,
    prompt_id: row.prompt_id ?? undefined,
    transcript: row.transcript ?? undefined,
    status: row.status,
    result: row.result_json ?? undefined,
    error: row.error ?? undefined,
    created_at: row.created_at,
  }));

  return {
    statusCode: 200,
    headers: corsHeaders,
    body: JSON.stringify({ jobs }),
  };
};
