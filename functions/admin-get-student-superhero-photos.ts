import { Handler } from '@netlify/functions';
import { neon } from '@neondatabase/serverless';
import { getHeaders } from './cors-headers';
import {
  authenticateAdminPhotos,
  LESSON_4_SLUG,
  resolveSuperheroPhotoFromAnswers,
} from './admin-superhero-photos-shared.js';

export const handler: Handler = async (event) => {
  const headers = getHeaders(event, false);

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: false, error: 'Method not allowed' }),
    };
  }

  if (!(await authenticateAdminPhotos(event))) {
    return {
      statusCode: 401,
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: false, error: 'Admin authentication required' }),
    };
  }

  const userId = event.queryStringParameters?.userId;
  if (!userId) {
    return {
      statusCode: 400,
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: false, error: 'userId is required' }),
    };
  }

  const databaseUrl = process.env.NEON_DATABASE_URL;
  if (!databaseUrl) {
    return {
      statusCode: 500,
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: false, error: 'Database configuration error' }),
    };
  }

  try {
    const sql = neon(databaseUrl);
    const rows = await sql`
      SELECT sar.completed_at, sar.answers
      FROM student_lesson_activity_results sar
      JOIN student_lessons sl ON sl.id = sar.student_lesson_id
      WHERE sar.user_id = ${userId}
        AND sl.slug = ${LESSON_4_SLUG}
        AND sar.activity_type = 'student_superhero_image_generate'
      ORDER BY sar.completed_at DESC NULLS LAST
      LIMIT 5
    `;

    const photos = (
      await Promise.all(
        (rows as Array<{ completed_at: string; answers: unknown }>).map(async (row) => {
          const answers =
            row.answers && typeof row.answers === 'object' && !Array.isArray(row.answers)
              ? (row.answers as Record<string, unknown>)
              : {};
          return resolveSuperheroPhotoFromAnswers(answers, row.completed_at);
        })
      )
    ).filter(Boolean);

    return {
      statusCode: 200,
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true, photos }),
    };
  } catch (error) {
    console.error('admin-get-student-superhero-photos error:', error);
    return {
      statusCode: 500,
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to load photos',
      }),
    };
  }
};
