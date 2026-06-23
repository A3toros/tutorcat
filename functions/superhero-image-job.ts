import { Handler } from '@netlify/functions';
import { neon } from '@neondatabase/serverless';
import { getHeaders } from './cors-headers';
import {
  assertSelfiePresent,
  resolveSuperheroAiBundle,
  type SuperheroImageJobInput,
} from './superhero-ai-shared.js';

const handler: Handler = async (event) => {
  const headers = getHeaders(event, true);

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: false, error: 'Method not allowed' }),
    };
  }

  try {
    let body: { studentLessonId?: string; bundle?: unknown; selfie_data_url?: string };
    try {
      body = JSON.parse(event.body || '{}');
    } catch {
      return {
        statusCode: 400,
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: false, error: 'Invalid JSON payload' }),
      };
    }

    const resolved = await resolveSuperheroAiBundle(event, body);
    assertSelfiePresent(resolved.bundle);

    const databaseUrl = process.env.NEON_DATABASE_URL;
    if (!databaseUrl) {
      throw new Error('Database configuration error');
    }

    const inputJson: SuperheroImageJobInput = {
      mode: resolved.mode,
      selfie_data_url: resolved.bundle.selfie_data_url!,
      bundle: resolved.mode === 'admin' ? resolved.bundle : null,
    };

    const sql = neon(databaseUrl);
    const rows = await sql`
      INSERT INTO superhero_image_jobs (
        user_id,
        student_lesson_id,
        status,
        input_json,
        updated_at
      )
      VALUES (
        ${resolved.userId ?? null},
        ${resolved.studentLessonId ?? null},
        'processing',
        ${JSON.stringify(inputJson)}::jsonb,
        NOW()
      )
      RETURNING id
    `;

    const jobId = (rows[0] as { id: string } | undefined)?.id;
    if (!jobId) {
      throw new Error('Failed to create image job');
    }

    return {
      statusCode: 200,
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true, jobId }),
    };
  } catch (error) {
    console.error('superhero-image-job error:', error);
    const message = error instanceof Error ? error.message : 'Failed to start image job';
    const statusCode =
      message.includes('Authentication') ||
      message.includes('Student access') ||
      message.includes('Admin authentication')
        ? 401
        : message.includes('Complete the Powers') || message.includes('hero face photo')
          ? 400
          : 500;
    return {
      statusCode,
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: false, error: message }),
    };
  }
};

export { handler };
