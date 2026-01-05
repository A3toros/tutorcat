import { Handler } from '@netlify/functions';
import { neon } from '@neondatabase/serverless';

// Admin authentication middleware
async function authenticateAdmin(event: any): Promise<boolean> {
  try {
    let token = null;

    // Try Authorization header first
    const authHeader = event.headers?.authorization || event.headers?.Authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
      console.log('Admin auth: Token from Authorization header');
    } else {
      // Fall back to cookie (check both lowercase and uppercase)
      const cookies = event.headers?.cookie || event.headers?.Cookie || '';
      console.log('Admin auth: Cookies received:', cookies ? 'yes' : 'no', cookies.substring(0, 100));
      const cookieArray = cookies.split(';');
      const tokenCookie = cookieArray.find((c: string) => c.trim().startsWith('admin_token='));

      if (tokenCookie) {
        token = tokenCookie.split('=')[1];
        console.log('Admin auth: Token found in cookie, length:', token?.length);
      } else {
        console.log('Admin auth: No admin_token cookie found. Available cookies:', cookieArray.map((c: string) => c.trim().split('=')[0]));
      }
    }

    if (!token) {
      console.log('Admin auth: No token found');
      return false;
    }

    const jwt = await import('jsonwebtoken');
    const jwtSecret = process.env.JWT_SECRET;
    console.log('Admin auth: JWT secret configured:', !!jwtSecret);
    if (!jwtSecret) return false;

    const decoded = jwt.verify(token, jwtSecret) as any;
    const isAdmin = decoded.role === 'admin';
    return isAdmin;
  } catch (error) {
    console.error('Admin authentication error:', error);
    return false;
  }
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

  // Check admin authentication
  const isAdmin = await authenticateAdmin(event);
  if (!isAdmin) {
    return {
      statusCode: 401,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: false, error: 'Admin authentication required' })
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

    // Get pagination parameters
    const { searchParams } = new URL(event.rawUrl || `http://localhost${event.path}`);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '25');
    const search = searchParams.get('search') || '';

    const offset = (page - 1) * limit;

    // Build the WHERE condition for search
    const whereClause = search ?
      sql`WHERE email ILIKE ${`%${search}%`} OR username ILIKE ${`%${search}%`} OR first_name ILIKE ${`%${search}%`} OR last_name ILIKE ${`%${search}%`}` :
      sql``;

    // Execute queries with template literals
    const [usersResult, countResult] = await Promise.all([
      sql`
        SELECT
          id,
          email,
          username,
          first_name,
          last_name,
          level,
          current_lesson,
          total_stars,
          created_at,
          last_login,
          email_verified
        FROM users
        ${whereClause}
        ORDER BY created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `,
      sql`
        SELECT COUNT(*) as total FROM users
        ${whereClause}
      `
    ]);

    const totalUsers = parseInt(countResult[0].total);
    const totalPages = Math.ceil(totalUsers / limit);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        users: usersResult,
        pagination: {
          page,
          limit,
          total: totalUsers,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1
        }
      })
    } as any;

  } catch (error) {
    console.error('Get users error:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: false, error: 'Failed to retrieve users' })
    } as any;
  }
};

export { handler };