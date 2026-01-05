import { Handler } from '@netlify/functions';
import { neon } from '@neondatabase/serverless';
import { validateJWT } from './auth-validate-jwt.js';

const handler: Handler = async (event, context) => {
  // Only allow GET requests
  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: false, error: 'Method not allowed' })
    } as any;
  }

  try {
    // Validate authentication
    const cookies = event.headers?.cookie || '';
    const token = cookies.split(';').find(c => c.trim().startsWith('access_token='))?.split('=')[1];

    if (!token) {
      return {
        statusCode: 401,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: false, error: 'Authentication required' })
      } as any;
    }

    const auth = await validateJWT(token);
    if (!auth.isValid || !auth.user) {
      return {
        statusCode: 401,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: false, error: 'Invalid authentication' })
      } as any;
    }

    const userId = auth.user.id;

    // Get database connection
    const databaseUrl = process.env.NEON_DATABASE_URL;
    if (!databaseUrl) {
      console.error('NEON_DATABASE_URL not configured');
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: false, error: 'Database configuration error' })
      } as any;
    }

    const sql = neon(databaseUrl);

    const url = new URL(event.rawUrl || `http://localhost${event.path}`);
    const level = url.searchParams.get('level');

    if (!level) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: false, error: 'Level is required' })
      } as any;
    }

    // Get all lessons for this level
    const lessonsResult = await sql`
      SELECT * FROM lessons
      WHERE level = ${level}
      ORDER BY lesson_number
    `;

    // Get user progress for all lessons if userId provided
    let userProgress: any[] = [];
    if (userId) {
      const lessonIds = lessonsResult.map((lesson: any) => lesson.id);
      if (lessonIds.length > 0) {
        const progressResult = await sql`
          SELECT * FROM user_progress
          WHERE user_id = ${userId} AND lesson_id = ANY(${lessonIds})
        `;
        userProgress = progressResult;
      }
    }

    // Get total activity count per lesson and completed activity count
    let activityCountsByLesson: Record<string, { total: number; completed: number }> = {};
    if (userId) {
      const lessonIds = lessonsResult.map((lesson: any) => lesson.id);
      if (lessonIds.length > 0) {
        // Get total activities per lesson
        const totalActivities = await sql`
          SELECT 
            lesson_id,
            COUNT(*) as total_count
          FROM lesson_activities
          WHERE lesson_id = ANY(${lessonIds})
          GROUP BY lesson_id
        `;
        
        // Get completed activities per lesson (distinct activity_order)
        const completedActivities = await sql`
          SELECT 
            lesson_id,
            COUNT(DISTINCT activity_order) as completed_count
          FROM lesson_activity_results
          WHERE user_id = ${userId} AND lesson_id = ANY(${lessonIds})
          GROUP BY lesson_id
        `;
        
        // Build map of total activities
        totalActivities.forEach((row: any) => {
          activityCountsByLesson[row.lesson_id] = {
            total: Number(row.total_count) || 0,
            completed: 0
          };
        });
        
        // Update with completed counts
        completedActivities.forEach((row: any) => {
          if (activityCountsByLesson[row.lesson_id]) {
            activityCountsByLesson[row.lesson_id].completed = Number(row.completed_count) || 0;
          }
        });
      }
    }

    // Combine lessons with progress data
    const lessonsWithProgress = lessonsResult.map((lesson: any) => {
      const progress = userProgress.find((p: any) => p.lesson_id === lesson.id);
      const activityCounts = activityCountsByLesson[lesson.id];
      
      // Calculate actual progress percentage based on completed activities / total activities
      let progressPercentage = 0;
      if (activityCounts && activityCounts.total > 0) {
        progressPercentage = Math.round((activityCounts.completed / activityCounts.total) * 100);
        // Cap at 100%
        progressPercentage = Math.min(100, progressPercentage);
      } else if (progress?.completed) {
        // If lesson is completed but no activity data, use 100%
        progressPercentage = 100;
      }
      
      return {
        ...lesson,
        userProgress: progress ? {
          ...progress,
          score: progressPercentage // Replace cumulative score with actual percentage
        } : null
      };
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        level,
        lessons: lessonsWithProgress,
        totalLessons: lessonsWithProgress.length
      })
    } as any;

  } catch (error) {
    console.error('Get lessons by level error:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: false,
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      })
    } as any;
  }
};

export { handler };
