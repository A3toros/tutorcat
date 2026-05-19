import { Handler } from '@netlify/functions';
import { neon } from '@neondatabase/serverless';

const ALLOWED_LEVELS = ['Pre-A1', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;

async function authenticateAdmin(event: { headers?: Record<string, string | undefined> }): Promise<boolean> {
  try {
    let token: string | null = null;
    const authHeader = event.headers?.authorization || event.headers?.Authorization;
    if (authHeader?.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    } else {
      const cookies = event.headers?.cookie || '';
      const tokenCookie = cookies.split(';').find((c) => c.trim().startsWith('admin_token='));
      if (tokenCookie) {
        token = tokenCookie.split('=')[1];
      }
    }
    if (!token) return false;

    const jwt = await import('jsonwebtoken');
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) return false;

    const decoded = jwt.verify(token, jwtSecret) as { role?: string };
    return decoded.role === 'admin';
  } catch {
    return false;
  }
}

function normalizeLevel(level: unknown): string | null {
  if (level === null || level === undefined || level === '') return null;
  if (typeof level !== 'string') return null;
  const trimmed = level.trim();
  if (!trimmed || trimmed === 'Not Assessed') return null;
  return trimmed;
}

export const handler: Handler = async (event) => {
  const jsonHeaders = { 'Content-Type': 'application/json' };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: jsonHeaders, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: jsonHeaders,
      body: JSON.stringify({ success: false, error: 'Method not allowed' }),
    };
  }

  const isAdmin = await authenticateAdmin(event);
  if (!isAdmin) {
    return {
      statusCode: 401,
      headers: jsonHeaders,
      body: JSON.stringify({ success: false, error: 'Admin authentication required' }),
    };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const { userId, level: levelInput } = body;

    if (!userId || typeof userId !== 'string') {
      return {
        statusCode: 400,
        headers: jsonHeaders,
        body: JSON.stringify({ success: false, error: 'User ID is required' }),
      };
    }

    const level = normalizeLevel(levelInput);
    if (level !== null && !ALLOWED_LEVELS.includes(level as (typeof ALLOWED_LEVELS)[number])) {
      return {
        statusCode: 400,
        headers: jsonHeaders,
        body: JSON.stringify({
          success: false,
          error: `Invalid level. Allowed: ${ALLOWED_LEVELS.join(', ')} or clear for Not Assessed`,
        }),
      };
    }

    const databaseUrl = process.env.NEON_DATABASE_URL;
    if (!databaseUrl) {
      return {
        statusCode: 500,
        headers: jsonHeaders,
        body: JSON.stringify({ success: false, error: 'Database configuration error' }),
      };
    }

    const sql = neon(databaseUrl);

    const userCheck = await sql`
      SELECT id, email, username, level FROM users WHERE id = ${userId}
    `;

    if (userCheck.length === 0) {
      return {
        statusCode: 404,
        headers: jsonHeaders,
        body: JSON.stringify({ success: false, error: 'User not found' }),
      };
    }

    const user = userCheck[0] as { id: string; email: string; username: string | null; level: string | null };

    const updated = await sql`
      UPDATE users
      SET level = ${level}, updated_at = NOW()
      WHERE id = ${userId}
      RETURNING id, email, username, level
    `;

    const row = updated[0] as { id: string; email: string; username: string | null; level: string | null };

    console.log(
      `[ADMIN] Updated level for ${user.email}: ${user.level ?? 'null'} → ${level ?? 'null'}`
    );

    return {
      statusCode: 200,
      headers: jsonHeaders,
      body: JSON.stringify({
        success: true,
        message: 'User level updated',
        user: row,
      }),
    };
  } catch (error) {
    console.error('Admin update user level error:', error);
    return {
      statusCode: 500,
      headers: jsonHeaders,
      body: JSON.stringify({ success: false, error: 'Failed to update user level' }),
    };
  }
};
