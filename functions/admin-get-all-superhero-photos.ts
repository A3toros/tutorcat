import { Handler } from '@netlify/functions';
import { neon } from '@neondatabase/serverless';
import { getHeaders } from './cors-headers';
import {
  authenticateAdminPhotos,
  classLabelForSchoolId,
  LESSON_4_SLUG,
  resolveSuperheroPhotoFromAnswers,
} from './admin-superhero-photos-shared.js';
import { listSuperheroPortraitPathsInBucket } from './superhero-supabase-storage.js';

type PhotoEntry = {
  user_id: string | null;
  school_student_id: string | null;
  nickname: string;
  class: '1/15' | '1/16' | null;
  job_id: string | null;
  portrait_path: string | null;
  source: string;
  completed_at: string;
  image_url: string;
  selfie_url: string | null;
  why_chosen: string | null;
  provider: string | null;
};

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

    const [activityRows, jobRows, bucketPaths] = await Promise.all([
      sql`
        SELECT
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
        ORDER BY sar.completed_at DESC NULLS LAST
      `,
      sql`
        SELECT
          j.id::text as job_id,
          j.user_id::text as user_id,
          u.school_student_id,
          u.nickname,
          j.updated_at as completed_at,
          j.result_json
        FROM superhero_image_jobs j
        JOIN student_lessons sl ON sl.id = j.student_lesson_id
        LEFT JOIN users u ON u.id = j.user_id
        WHERE sl.slug = ${LESSON_4_SLUG}
          AND j.status = 'completed'
          AND j.result_json IS NOT NULL
        ORDER BY j.updated_at DESC NULLS LAST
      `,
      listSuperheroPortraitPathsInBucket(),
    ]);

    const pending = new Map<string, {
      user_id: string | null;
      school_student_id: string | null;
      nickname: string;
      job_id: string | null;
      portrait_path: string | null;
      source: string;
      completed_at: string;
      answers: Record<string, unknown>;
    }>();

    const remember = (
      dedupeKey: string,
      entry: {
        user_id: string | null;
        school_student_id: string | null;
        nickname: string;
        job_id: string | null;
        portrait_path: string | null;
        source: string;
        completed_at: string;
        answers: Record<string, unknown>;
      }
    ) => {
      const existing = pending.get(dedupeKey);
      if (!existing || new Date(entry.completed_at) > new Date(existing.completed_at)) {
        pending.set(dedupeKey, entry);
      }
    };

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
      const jobId = typeof answers.job_id === 'string' ? answers.job_id : null;
      const portraitPath =
        typeof answers.portrait_storage_path === 'string'
          ? answers.portrait_storage_path
          : jobId
            ? `${jobId}/portrait.png`
            : null;
      const key = portraitPath || jobId || `activity:${row.user_id}:${row.completed_at}`;
      remember(key, {
        user_id: row.user_id,
        school_student_id: row.school_student_id ? String(row.school_student_id) : null,
        nickname: row.nickname ? String(row.nickname) : '',
        job_id: jobId,
        portrait_path: portraitPath,
        source: 'activity',
        completed_at: row.completed_at,
        answers,
      });
    }

    for (const row of jobRows as Array<{
      job_id: string;
      user_id: string | null;
      school_student_id: string | null;
      nickname: string | null;
      completed_at: string;
      result_json: unknown;
    }>) {
      const result =
        row.result_json && typeof row.result_json === 'object' && !Array.isArray(row.result_json)
          ? (row.result_json as Record<string, unknown>)
          : {};
      const portraitPath =
        typeof result.portrait_storage_path === 'string'
          ? result.portrait_storage_path
          : `${row.job_id}/portrait.png`;
      remember(portraitPath, {
        user_id: row.user_id,
        school_student_id: row.school_student_id ? String(row.school_student_id) : null,
        nickname: row.nickname ? String(row.nickname) : '',
        job_id: row.job_id,
        portrait_path: portraitPath,
        source: 'job',
        completed_at: row.completed_at,
        answers: {
          job_id: row.job_id,
          portrait_storage_path: result.portrait_storage_path,
          selfie_storage_path: result.selfie_storage_path,
          why_chosen: result.why_chosen,
          provider: result.model,
          image_data_url: result.image_data_url,
        },
      });
    }

    for (const portraitPath of bucketPaths) {
      const jobId = portraitPath.includes('/') ? portraitPath.split('/')[0] : null;
      const key = portraitPath;
      if (pending.has(key)) continue;
      remember(key, {
        user_id: null,
        school_student_id: null,
        nickname: '',
        job_id: jobId,
        portrait_path: portraitPath,
        source: 'bucket',
        completed_at: new Date(0).toISOString(),
        answers: {
          job_id: jobId,
          portrait_storage_path: portraitPath,
        },
      });
    }

    const jobIdsNeedingUser = [...pending.values()]
      .filter((p) => !p.user_id && p.job_id)
      .map((p) => p.job_id as string);

    if (jobIdsNeedingUser.length > 0) {
      const userRows = await sql`
        SELECT
          j.id::text as job_id,
          j.user_id::text as user_id,
          u.school_student_id,
          u.nickname,
          j.updated_at as completed_at,
          j.result_json
        FROM superhero_image_jobs j
        LEFT JOIN users u ON u.id = j.user_id
        WHERE j.id = ANY(${jobIdsNeedingUser}::uuid[])
      `;
      for (const row of userRows as Array<{
        job_id: string;
        user_id: string | null;
        school_student_id: string | null;
        nickname: string | null;
        completed_at: string;
        result_json: unknown;
      }>) {
        for (const [key, entry] of pending.entries()) {
          if (entry.job_id !== row.job_id || entry.user_id) continue;
          const result =
            row.result_json && typeof row.result_json === 'object' && !Array.isArray(row.result_json)
              ? (row.result_json as Record<string, unknown>)
              : {};
          pending.set(key, {
            ...entry,
            user_id: row.user_id,
            school_student_id: row.school_student_id ? String(row.school_student_id) : null,
            nickname: row.nickname ? String(row.nickname) : entry.nickname,
            completed_at: row.completed_at || entry.completed_at,
            answers: {
              ...entry.answers,
              job_id: row.job_id,
              portrait_storage_path:
                entry.answers.portrait_storage_path ?? result.portrait_storage_path,
              selfie_storage_path: result.selfie_storage_path,
              why_chosen: result.why_chosen,
              provider: result.model,
            },
            source: entry.source === 'bucket' ? 'bucket+job' : entry.source,
          });
        }
      }
    }

    const photos: PhotoEntry[] = [];
    let skipped = 0;

    for (const entry of pending.values()) {
      const resolved = await resolveSuperheroPhotoFromAnswers(entry.answers, entry.completed_at);
      if (!resolved) {
        skipped += 1;
        continue;
      }

      const sid = entry.school_student_id;
      photos.push({
        user_id: entry.user_id,
        school_student_id: sid,
        nickname: entry.nickname,
        class: classLabelForSchoolId(sid),
        job_id: entry.job_id,
        portrait_path: entry.portrait_path,
        source: entry.source,
        ...resolved,
      });
    }

    photos.sort(
      (a, b) => new Date(b.completed_at).getTime() - new Date(a.completed_at).getTime()
    );

    return {
      statusCode: 200,
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        photos,
        stats: {
          activity_rows: (activityRows as unknown[]).length,
          job_rows: (jobRows as unknown[]).length,
          bucket_portraits: bucketPaths.length,
          candidates: pending.size,
          shown: photos.length,
          skipped,
        },
      }),
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
