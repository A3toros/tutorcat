import { Handler } from '@netlify/functions';
import { neon, NeonQueryFunction } from '@neondatabase/serverless';
import { getHeaders } from './cors-headers';
import { requireStudentAuth } from './student-auth.js';

interface Submission {
  studentLessonId: string;
  activityId?: string;
  activityType: string;
  activityOrder: number;
  score?: number;
  maxScore?: number;
  attempts?: number;
  timeSpent?: number;
  completedAt?: string;
  answers?: unknown;
  feedback?: unknown;
  isFinal?: boolean;
}

const isValidUUID = (str: string | undefined): boolean =>
  !!str && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);

function sanitizeActivityAnswers(activityType: string, answers: unknown): unknown {
  if (activityType !== 'student_superhero_image_generate') return answers;
  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) return answers;
  const copy = { ...(answers as Record<string, unknown>) };
  delete copy.image_data_url;
  delete copy.selfie_data_url;
  return copy;
}

async function upsertActivityResult(
  sql: NeonQueryFunction<false, false>,
  params: {
    userId: string;
    studentLessonId: string;
    activityId: string | null;
    activityType: string;
    activityOrder: number;
    activityScore: number;
    activityMaxScore: number;
    attempts: number;
    timeSpent: number | null;
    completedAt: string;
    answersJson: string;
    feedbackJson: string;
  }
): Promise<void> {
  const {
    userId,
    studentLessonId,
    activityId,
    activityType,
    activityOrder,
    activityScore,
    activityMaxScore,
    attempts,
    timeSpent,
    completedAt,
    answersJson,
    feedbackJson,
  } = params;

  // Match by activity_id when present, else by activity_order (works without partial-index ON CONFLICT)
  const existingRows = activityId
    ? await sql`
        SELECT id FROM student_lesson_activity_results
        WHERE user_id = ${userId}
          AND student_lesson_id = ${studentLessonId}
          AND (
            activity_id = ${activityId}
            OR activity_order = ${activityOrder}
          )
        ORDER BY completed_at DESC NULLS LAST
        LIMIT 1
      `
    : await sql`
        SELECT id FROM student_lesson_activity_results
        WHERE user_id = ${userId}
          AND student_lesson_id = ${studentLessonId}
          AND activity_order = ${activityOrder}
        LIMIT 1
      `;

  const existingId = (existingRows as Array<{ id: string }>)[0]?.id;

  if (existingId) {
    await sql`
      UPDATE student_lesson_activity_results
      SET
        activity_id = ${activityId},
        activity_type = ${activityType},
        activity_order = ${activityOrder},
        score = ${activityScore},
        max_score = ${activityMaxScore},
        attempts = ${attempts},
        time_spent = ${timeSpent},
        completed_at = ${completedAt}::timestamp,
        answers = ${answersJson}::jsonb,
        feedback = ${feedbackJson}::jsonb
      WHERE id = ${existingId}
    `;
    return;
  }

  await sql`
    INSERT INTO student_lesson_activity_results (
      user_id, student_lesson_id, activity_id, activity_type, activity_order,
      score, max_score, attempts, time_spent, completed_at, answers, feedback
    ) VALUES (
      ${userId}, ${studentLessonId}, ${activityId}, ${activityType}, ${activityOrder},
      ${activityScore}, ${activityMaxScore}, ${attempts}, ${timeSpent},
      ${completedAt}::timestamp, ${answersJson}::jsonb, ${feedbackJson}::jsonb
    )
  `;
}

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
    const auth = await requireStudentAuth(event);
    if (!auth.ok) {
      return {
        statusCode: auth.statusCode,
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: false, error: auth.error }),
      };
    }

    let submission: Submission;
    try {
      submission = JSON.parse(event.body || '{}');
    } catch {
      return {
        statusCode: 400,
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: false, error: 'Invalid JSON payload' }),
      };
    }

    if (!submission.studentLessonId || !submission.activityType || submission.activityOrder === undefined) {
      return {
        statusCode: 400,
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          success: false,
          error: 'Missing required fields: studentLessonId, activityType, activityOrder',
        }),
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

    const sql = neon(databaseUrl);
    const userId = auth.user.id;

    let activityId: string | null = isValidUUID(submission.activityId) ? submission.activityId! : null;

    if (!activityId) {
      const found = await sql`
        SELECT id FROM student_lesson_activities
        WHERE student_lesson_id = ${submission.studentLessonId}
          AND activity_order = ${submission.activityOrder}
          AND active = TRUE
        LIMIT 1
      `;
      const foundRow = (found as Array<{ id: string }>)[0];
      if (foundRow?.id) activityId = foundRow.id;
    }

    const activityScore = submission.score ?? 0;
    const activityMaxScore = submission.maxScore ?? 0;
    const completedAt = submission.completedAt || new Date().toISOString();
    const answersJson = JSON.stringify(
      sanitizeActivityAnswers(submission.activityType, submission.answers ?? {})
    );
    const feedbackJson = JSON.stringify(submission.feedback ?? {});

    await upsertActivityResult(sql, {
      userId,
      studentLessonId: submission.studentLessonId,
      activityId,
      activityType: submission.activityType,
      activityOrder: submission.activityOrder,
      activityScore,
      activityMaxScore,
      attempts: submission.attempts ?? 1,
      timeSpent: submission.timeSpent ?? null,
      completedAt,
      answersJson,
      feedbackJson,
    });

    await sql`
      INSERT INTO student_user_progress (user_id, student_lesson_id, score, completed, completed_at, attempts)
      VALUES (
        ${userId},
        ${submission.studentLessonId},
        (
          SELECT COALESCE(SUM(score), 0)::int
          FROM student_lesson_activity_results
          WHERE user_id = ${userId} AND student_lesson_id = ${submission.studentLessonId}
        ),
        false,
        null,
        ${submission.attempts ?? 1}
      )
      ON CONFLICT (user_id, student_lesson_id)
      DO UPDATE SET
        score = (
          SELECT COALESCE(SUM(score), 0)::int
          FROM student_lesson_activity_results
          WHERE user_id = ${userId} AND student_lesson_id = ${submission.studentLessonId}
        ),
        attempts = GREATEST(student_user_progress.attempts, ${submission.attempts ?? 1})
    `;

    const countRows = await sql`
      SELECT COUNT(*)::int AS completed_count
      FROM student_lesson_activity_results
      WHERE user_id = ${userId} AND student_lesson_id = ${submission.studentLessonId}
    `;

    return {
      statusCode: 200,
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        message: 'Activity submitted',
        completedActivityCount: countRows[0]?.completed_count ?? 0,
        activityOrder: submission.activityOrder,
      }),
    };
  } catch (error) {
    console.error('submit-student-lesson-activity error:', error);
    return {
      statusCode: 500,
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: false,
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
      }),
    };
  }
};

export { handler };
