import { Handler } from '@netlify/functions';
import { neon } from '@neondatabase/serverless';
import { getHeaders } from './cors-headers';
import {
  authenticateAdminPhotos,
  classLabelForSchoolId,
  LESSON_4_SLUG,
  resolveSuperheroPhotoFromAnswers,
  resolveSuperheroPhotoFromJobResult,
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

    const activityRows = await sql`
      SELECT DISTINCT ON (sar.user_id)
        u.id::text as user_id,
        u.school_student_id,
        u.nickname,
        sar.completed_at,
        sar.answers
      FROM student_lesson_activity_results sar
      JOIN student_lessons sl ON sl.id = sar.student_lesson_id
      JOIN users u ON u.id = sar.user_id
      WHERE sl.slug = ${LESSON_4_SLUG}
        AND sar.activity_type = 'student_superhero_image_generate'
        AND u.role = 'student'
      ORDER BY sar.user_id, sar.completed_at DESC NULLS LAST
    `;

    const jobRows = await sql`
      SELECT DISTINCT ON (j.user_id)
        j.id::text as job_id,
        j.user_id::text as user_id,
        u.school_student_id,
        u.nickname,
        j.updated_at as completed_at,
        j.result_json
      FROM superhero_image_jobs j
      JOIN student_lessons sl ON sl.id = j.student_lesson_id
      JOIN users u ON u.id = j.user_id
      WHERE sl.slug = ${LESSON_4_SLUG}
        AND j.status = 'completed'
        AND j.result_json IS NOT NULL
        AND u.role = 'student'
      ORDER BY j.user_id, j.updated_at DESC NULLS LAST
    `;

    const photosByUser = new Map<string, Record<string, unknown>>();

    for (const row of activityRows as Array<{
      user_id: string;
      school_student_id: string | null;
      nickname: string | null;
      completed_at: string;
      answers: unknown;
    }>) {
      const answers =
        row.answers && typeof row.answers === 'object' && !Array.isArray(row.answers)
          ? (row.answers as Record<string, unknown>)
          : {};
      const photo = await resolveSuperheroPhotoFromAnswers(answers, row.completed_at);
      if (!photo) continue;
      const sid = row.school_student_id ? String(row.school_student_id) : null;
      photosByUser.set(row.user_id, {
        user_id: row.user_id,
        school_student_id: sid,
        nickname: row.nickname ? String(row.nickname) : '',
        class: classLabelForSchoolId(sid),
        source: 'activity',
        ...photo,
      });
    }

    for (const row of jobRows as Array<{
      job_id: string;
      user_id: string;
      school_student_id: string | null;
      nickname: string | null;
      completed_at: string;
      result_json: unknown;
    }>) {
      if (photosByUser.has(row.user_id)) continue;
      const photo = await resolveSuperheroPhotoFromJobResult(
        row.job_id,
        row.result_json,
        row.completed_at
      );
      if (!photo) continue;
      const sid = row.school_student_id ? String(row.school_student_id) : null;
      photosByUser.set(row.user_id, {
        user_id: row.user_id,
        school_student_id: sid,
        nickname: row.nickname ? String(row.nickname) : '',
        class: classLabelForSchoolId(sid),
        source: 'job',
        ...photo,
      });
    }

    const photos = [...photosByUser.values()].sort((a, b) => {
      const idCmp = String(a.school_student_id || '').localeCompare(String(b.school_student_id || ''));
      if (idCmp !== 0) return idCmp;
      return new Date(String(b.completed_at)).getTime() - new Date(String(a.completed_at)).getTime();
    });

    return {
      statusCode: 200,
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true, photos }),
    };
  } catch (error) {
    console.error('admin-get-all-superhero-photos error:', error);
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
