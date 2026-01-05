import { Handler } from '@netlify/functions';
import { neon } from '@neondatabase/serverless';

// Input sanitization utilities
function sanitizeString(value: string, maxLength: number = 1000): string {
  if (value === null || value === undefined) return '';
  return String(value)
    .normalize('NFKC')
    .replace(/[\x00-\x1F\x7F]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function sanitizeUsername(username: string): string {
  if (!username || typeof username !== 'string') return '';
  return sanitizeString(username.toLowerCase().trim(), 32);
}

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
    const username = url.searchParams.get('username');

    if (!username) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          available: false,
          error: 'Username parameter is required'
        })
      } as any;
    }

    const safeUsername = sanitizeUsername(username);

    if (!safeUsername) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          available: false,
          error: 'Invalid username format'
        })
      } as any;
    }

    // Check if username exists in users table
    const result = await sql`
      SELECT COUNT(*) as count FROM users WHERE username = ${safeUsername}
    `;

    const count = parseInt(result[0].count);
    const available = count === 0;

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        available,
        username: safeUsername
      })
    } as any;

  } catch (error) {
    console.error('check-username error:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        available: false,
        error: 'Internal server error'
      })
    } as any;
  }
};

export { handler };
