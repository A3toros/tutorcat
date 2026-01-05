import { Handler } from '@netlify/functions';
import { neon } from '@neondatabase/serverless';

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
    const healthCheck: any = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development'
    };

    // Check database connection if configured
    if (process.env.NEON_DATABASE_URL) {
      try {
        const sql = neon(process.env.NEON_DATABASE_URL);
        await sql`SELECT 1 as health_check`;
        healthCheck.database = 'connected';
      } catch (dbError) {
        console.error('Database health check failed:', dbError);
        healthCheck.database = 'disconnected';
        healthCheck.status = 'degraded';
      }
    } else {
      healthCheck.database = 'not configured';
    }

    // Check AI services
    healthCheck.services = {
      openrouter: !!process.env.OPENROUTER_API_KEY,
      assemblyai: !!process.env.ASSEMBLYAI_API_KEY,
      resend: !!process.env.RESEND_API_KEY,
      jwt: !!process.env.JWT_SECRET
    };

    const statusCode = healthCheck.status === 'healthy' ? 200 : 503;

    return {
      statusCode,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        ...healthCheck
      })
    } as any;

  } catch (error) {
    console.error('Health check error:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: false,
        status: 'unhealthy',
        error: 'Health check failed',
        timestamp: new Date().toISOString()
      })
    } as any;
  }
};

export { handler };
