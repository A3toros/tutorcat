import { Handler } from '@netlify/functions';
import { neon } from '@neondatabase/serverless';
import { getHeaders } from './cors-headers';
import { requireStudentAuth } from './student-auth.js';

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

    const url = new URL(event.rawUrl || `http://localhost${event.path}`);
    const lessonId = url.searchParams.get('lessonId');

    if (!lessonId) {
      return {
        statusCode: 400,
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: false, error: 'lessonId is required' }),
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

    const [lessonRows, activitiesResult, progressResult, results] = await Promise.all([
      sql`
        SELECT * FROM student_lessons WHERE id = ${lessonId} AND active = TRUE
      `,
      sql`
        SELECT
          sla.id,
          sla.student_lesson_id,
          sla.activity_type,
          sla.activity_order,
          sla.title,
          sla.description,
          sla.estimated_time_seconds,
          sla.content,
          sla.created_at,
          sla.updated_at,
          COALESCE(json_agg(DISTINCT vi.*) FILTER (WHERE vi.id IS NOT NULL), '[]') as vocabulary_items,
          COALESCE(json_agg(DISTINCT gi.*) FILTER (WHERE gi.id IS NOT NULL), '[]') as grammar_items,
          COALESCE(json_agg(DISTINCT pi.*) FILTER (WHERE pi.id IS NOT NULL), '[]') as poll_items
        FROM student_lesson_activities sla
        LEFT JOIN student_vocabulary_items vi ON sla.id = vi.activity_id
        LEFT JOIN student_grammar_items gi ON sla.id = gi.activity_id
        LEFT JOIN student_poll_items pi ON sla.id = pi.activity_id
        WHERE sla.student_lesson_id = ${lessonId} AND sla.active = TRUE
        GROUP BY sla.id, sla.student_lesson_id, sla.activity_type, sla.activity_order,
                 sla.title, sla.description, sla.estimated_time_seconds, sla.content,
                 sla.created_at, sla.updated_at
        ORDER BY sla.activity_order ASC
      `,
      sql`
        SELECT * FROM student_user_progress
        WHERE user_id = ${userId} AND student_lesson_id = ${lessonId}
        LIMIT 1
      `,
      sql`
        SELECT
          activity_id,
          activity_type,
          activity_order,
          score,
          max_score,
          attempts,
          time_spent,
          completed_at,
          answers,
          feedback
        FROM student_lesson_activity_results
        WHERE user_id = ${userId} AND student_lesson_id = ${lessonId}
        ORDER BY activity_order ASC
      `,
    ]);

    if (!lessonRows.length) {
      return {
        statusCode: 404,
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: false, error: 'Lesson not found' }),
      };
    }

    const lesson = lessonRows[0];
    const totalActivities = activitiesResult.length;
    const completedActivityCount = results.length;

    const activityResults = results.map((r: Record<string, unknown>) => ({
      activityId: r.activity_id,
      activityType: r.activity_type,
      activityOrder: r.activity_order,
      score: r.score || 0,
      maxScore: r.max_score || 0,
      attempts: r.attempts || 1,
      timeSpent: r.time_spent || 0,
      completed: true,
      completedAt: r.completed_at ? new Date(r.completed_at as string).getTime() : Date.now(),
      answers: r.answers,
      feedback: r.feedback,
    }));

    const progressPercentage =
      totalActivities > 0
        ? Math.min(100, Math.round((completedActivityCount / totalActivities) * 100))
        : 0;

    const userProgress = progressResult[0]
      ? {
          ...progressResult[0],
          progress_percentage: progressResult[0].completed ? 100 : progressPercentage,
        }
      : completedActivityCount > 0
        ? {
            user_id: userId,
            student_lesson_id: lessonId,
            score: progressPercentage,
            completed: false,
            progress_percentage: progressPercentage,
          }
        : null;

    return {
      statusCode: 200,
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        lesson,
        activities: activitiesResult,
        userProgress,
        activityResults,
        completedActivityCount,
        totalActivities,
      }),
    };
  } catch (error) {
    console.error('get-student-lesson error:', error);
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
