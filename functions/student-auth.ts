import * as jwt from 'jsonwebtoken';
import { neon } from '@neondatabase/serverless';
import { extractTokenFromCookies } from './auth-validate-jwt.js';

export interface StudentAuthUser {
  id: string;
  email: string;
  username: string;
  firstName: string;
  lastName: string;
  role: string;
  schoolStudentId?: string | null;
  honorific?: string | null;
  nickname?: string | null;
  currentStudentLesson?: number | null;
}

export async function requireStudentAuth(event: {
  headers?: Record<string, string | undefined>;
}): Promise<{ ok: true; user: StudentAuthUser } | { ok: false; statusCode: number; error: string }> {
  const cookies = event.headers?.cookie || '';
  const token = extractTokenFromCookies(cookies);

  if (!token) {
    return { ok: false, statusCode: 401, error: 'Authentication required' };
  }

  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    return { ok: false, statusCode: 500, error: 'JWT configuration error' };
  }

  let decoded: { userId?: string; role?: string };
  try {
    decoded = jwt.verify(token, jwtSecret) as { userId?: string; role?: string };
  } catch {
    return { ok: false, statusCode: 401, error: 'Invalid or expired token' };
  }

  const databaseUrl = process.env.NEON_DATABASE_URL;
  if (!databaseUrl) {
    return { ok: false, statusCode: 500, error: 'Database configuration error' };
  }

  const sql = neon(databaseUrl);
  const rows = await sql`
    SELECT id, email, username, first_name, last_name, role,
           school_student_id, honorific, nickname, current_student_lesson, session_revoked_at
    FROM users
    WHERE id = ${decoded.userId}
  `;

  if (!rows.length) {
    return { ok: false, statusCode: 404, error: 'User not found' };
  }

  const row = rows[0] as {
    id: string;
    email: string;
    username: string;
    first_name: string;
    last_name: string;
    role: string;
    school_student_id: string | null;
    honorific: string | null;
    nickname: string | null;
    current_student_lesson: number | null;
    session_revoked_at: string | null;
  };

  if (row.session_revoked_at && decoded && 'iat' in decoded) {
    const tokenIssuedAt = new Date((decoded as { iat: number }).iat * 1000);
    if (tokenIssuedAt < new Date(row.session_revoked_at)) {
      return { ok: false, statusCode: 401, error: 'Session has been revoked' };
    }
  }

  if (row.role !== 'student') {
    return { ok: false, statusCode: 403, error: 'Student access only' };
  }

  return {
    ok: true,
    user: {
      id: row.id,
      email: row.email,
      username: row.username,
      firstName: row.first_name,
      lastName: row.last_name,
      role: row.role,
      schoolStudentId: row.school_student_id,
      honorific: row.honorific,
      nickname: row.nickname,
      currentStudentLesson: row.current_student_lesson,
    },
  };
}
