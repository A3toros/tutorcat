import { Handler } from '@netlify/functions';
import { neon } from '@neondatabase/serverless';
import { getHeaders } from './cors-headers';
import { requireStudentAuth } from './student-auth.js';

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

    let body: { studentLessonId?: string };
    try {
      body = JSON.parse(event.body || '{}');
    } catch {
      return {
        statusCode: 400,
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: false, error: 'Invalid JSON payload' }),
      };
    }

    if (!body.studentLessonId) {
      return {
        statusCode: 400,
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: false, error: 'studentLessonId is required' }),
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
    const studentLessonId = body.studentLessonId;

    const activityResults = await sql`
      SELECT score, max_score, activity_order
      FROM student_lesson_activity_results
      WHERE user_id = ${userId} AND student_lesson_id = ${studentLessonId}
    `;

    const totalScore = activityResults.reduce(
      (sum, r) => sum + (Number(r.score) || 0),
      0
    );
    const maxScore = activityResults.reduce(
      (sum, r) => sum + (Number(r.max_score) || 0),
      0
    );
    const percentage = maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 100;
    const isPassed = maxScore === 0 ? true : percentage >= 60;

    const lessonMeta = await sql`
      SELECT lesson_number FROM student_lessons WHERE id = ${studentLessonId}
    `;
    const lessonNumber = lessonMeta.length ? Number(lessonMeta[0].lesson_number) : null;

    await sql`BEGIN`;

    try {
      if (!isPassed) {
        await sql`
          DELETE FROM student_lesson_activity_results
          WHERE user_id = ${userId} AND student_lesson_id = ${studentLessonId}
        `;
        await sql`
          DELETE FROM student_user_progress
          WHERE user_id = ${userId} AND student_lesson_id = ${studentLessonId}
        `;
        await sql`COMMIT`;

        return {
          statusCode: 200,
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            success: true,
            data: {
              studentLessonId,
              totalScore,
              maxScore,
              percentage,
              passed: false,
              reset: true,
              completedAt: new Date().toISOString(),
            },
          }),
        };
      }

      const existing = await sql`
        SELECT id, attempts FROM student_user_progress
        WHERE user_id = ${userId} AND student_lesson_id = ${studentLessonId}
      `;

      if (existing.length) {
        await sql`
          UPDATE student_user_progress
          SET score = ${totalScore}, completed = true, completed_at = NOW(),
              attempts = ${existing[0].attempts + 1}
          WHERE user_id = ${userId} AND student_lesson_id = ${studentLessonId}
        `;
      } else {
        await sql`
          INSERT INTO student_user_progress (user_id, student_lesson_id, score, completed, completed_at, attempts)
          VALUES (${userId}, ${studentLessonId}, ${totalScore}, true, NOW(), 1)
        `;
      }

      if (lessonNumber !== null) {
        const nextLesson = lessonNumber + 1;
        await sql`
          UPDATE users
          SET current_student_lesson = GREATEST(COALESCE(current_student_lesson, 1), ${nextLesson})
          WHERE id = ${userId}
            AND COALESCE(current_student_lesson, 1) <= ${lessonNumber}
        `;
      }

      await sql`COMMIT`;

      return {
        statusCode: 200,
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          success: true,
          data: {
            studentLessonId,
            totalScore,
            maxScore,
            percentage,
            passed: true,
            reset: false,
            completedAt: new Date().toISOString(),
          },
        }),
      };
    } catch (txError) {
      await sql`ROLLBACK`;
      throw txError;
    }
  } catch (error) {
    console.error('finalize-student-lesson error:', error);
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
