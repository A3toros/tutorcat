import { Handler } from '@netlify/functions';
import { neon } from '@neondatabase/serverless';
import { getHeaders } from './cors-headers';
import { requireStudentAuth } from './student-auth.js';
import { sumEffectiveScores } from './student-lesson-scoring.js';

const handler: Handler = async (event) => {
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

  try {
    const auth = await requireStudentAuth(event);
    if (!auth.ok) {
      return {
        statusCode: auth.statusCode,
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: false, error: auth.error }),
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

    const allActivityResults = await sql`
      SELECT student_lesson_id, activity_type, score, max_score, answers, feedback
      FROM student_lesson_activity_results
      WHERE user_id = ${userId}
    `;

    const percentageByLesson = new Map<string, number>();
    const byLesson = new Map<string, typeof allActivityResults>();
    for (const row of allActivityResults as Array<{ student_lesson_id: string }>) {
      const lid = String(row.student_lesson_id);
      const list = byLesson.get(lid) || [];
      list.push(row);
      byLesson.set(lid, list);
    }
    for (const [lid, rows] of byLesson.entries()) {
      percentageByLesson.set(lid, sumEffectiveScores(rows).percentage);
    }

    const lessons = await sql`
      SELECT
        sl.id,
        sl.lesson_number,
        sl.topic,
        sl.slug,
        sl.communication_goal,
        sl.live_duration_minutes,
        COALESCE(sup.completed, FALSE) as completed,
        COALESCE(sup.score, 0) as score,
        (
          SELECT COALESCE(SUM(sar.max_score), 0)::int
          FROM student_lesson_activity_results sar
          WHERE sar.user_id = ${userId}
            AND sar.student_lesson_id = sl.id
        ) as max_score_total,
        (
          SELECT COUNT(*)::int FROM student_lesson_activities sla
          WHERE sla.student_lesson_id = sl.id AND sla.active = TRUE
        ) as activity_count,
        (
          SELECT COUNT(DISTINCT sar.activity_order)::int
          FROM student_lesson_activity_results sar
          WHERE sar.user_id = ${userId}
            AND sar.student_lesson_id = sl.id
        ) as completed_activity_count
      FROM student_lessons sl
      LEFT JOIN student_user_progress sup
        ON sup.student_lesson_id = sl.id AND sup.user_id = ${userId}
      WHERE sl.active = TRUE
      ORDER BY sl.lesson_number ASC
    `;

    const currentLesson = auth.user.currentStudentLesson ?? 1;

    const lessonList = lessons.map((row: Record<string, unknown>) => {
      const lessonNumber = Number(row.lesson_number);
      const activityCount = Number(row.activity_count) || 0;
      const completedCount = Number(row.completed_activity_count) || 0;
      const progressPct =
        activityCount > 0 ? Math.min(100, Math.round((completedCount / activityCount) * 100)) : 0;

      return {
        id: row.id,
        lesson_number: lessonNumber,
        topic: row.topic,
        slug: row.slug,
        communication_goal: row.communication_goal,
        live_duration_minutes: row.live_duration_minutes,
        completed: Boolean(row.completed),
        score: Number(row.score) || 0,
        score_percentage: Boolean(row.completed)
          ? percentageByLesson.get(String(row.id)) ?? null
          : null,
        progress_percentage: Boolean(row.completed) ? 100 : progressPct,
        locked: false,
      };
    });

    const completedLessons = lessonList.filter((l) => l.completed).length;

    return {
      statusCode: 200,
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        user: {
          id: auth.user.id,
          email: auth.user.email,
          firstName: auth.user.firstName,
          lastName: auth.user.lastName,
          schoolStudentId: auth.user.schoolStudentId,
          honorific: auth.user.honorific,
          nickname: auth.user.nickname,
          currentStudentLesson: currentLesson,
        },
        progress: {
          completedLessons,
          totalLessons: lessonList.length,
        },
        lessons: lessonList,
      }),
    };
  } catch (error) {
    console.error('get-student-dashboard error:', error);
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
