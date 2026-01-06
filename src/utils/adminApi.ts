/**
 * Admin API utility with automatic token expiration handling
 * Uses HTTP cookies for admin authentication (not localStorage)
 */

/**
 * Make an authenticated admin API request
 * Automatically handles token expiration and redirects to login
 * Admin token is stored in HTTP cookie (admin_token), sent automatically with credentials: 'include'
 */
export async function adminApiRequest(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  // Admin token is in HTTP cookie, not localStorage
  // Cookies are sent automatically with credentials: 'include'
  // No need to check localStorage or add Authorization header
  // The backend will read from the admin_token cookie

  const headers = {
    'Content-Type': 'application/json',
    ...options.headers
  };

  console.log('adminApiRequest: Making request to', url, { 
    usingCookies: true,
    credentials: 'include',
    hasCookies: typeof document !== 'undefined' ? document.cookie.length > 0 : false,
    cookiePreview: typeof document !== 'undefined' ? document.cookie.substring(0, 100) : 'N/A (SSR)'
  });

  const response = await fetch(url, {
    ...options,
    headers,
    credentials: 'include' // Include cookies (admin_token will be sent automatically)
  });

  console.log('adminApiRequest: Response status', response.status, 'for', url);
  
  // Log response headers to see if Set-Cookie was sent
  const setCookieHeader = response.headers.get('Set-Cookie');
  if (setCookieHeader) {
    console.log('adminApiRequest: Set-Cookie header received:', setCookieHeader.substring(0, 100));
  }

  // Check for 401 (unauthorized) - token expired
  if (response.status === 401) {
    // Admin token expired - trigger full logout
    console.warn('Admin token expired, logging out user');

    if (typeof window !== 'undefined') {
      // Clear localStorage (preserve cookie consent)
      const cookieConsentData = localStorage.getItem('cookie_consent_data');
      localStorage.clear();
      if (cookieConsentData) {
        localStorage.setItem('cookie_consent_data', cookieConsentData);
      }

      // Redirect to home page (AuthContext will detect logout)
      window.location.href = '/';
    }

    throw new Error('Admin session expired. Logging out...');
  }

  return response;
}

/**
 * Handle expired token - redirect to login
 * Cookies are managed by the browser, no need to clear localStorage
 */
function handleTokenExpired() {
  // Only redirect if not already on home page to prevent loops
  const currentPath = typeof window !== 'undefined' ? window.location.pathname : '';
  if (currentPath !== '/' && typeof window !== 'undefined') {
    window.location.href = '/';
  }
}

/**
 * Check if admin is authenticated
 * Note: We can't check cookies from JavaScript (HttpOnly), so we rely on API responses
 * This function is kept for compatibility but always returns true (cookies are checked server-side)
 */
export function isAdminAuthenticated(): boolean {
  // Can't check HttpOnly cookies from JavaScript
  // Authentication is verified server-side via cookies
  return true; // Assume authenticated if we're making admin API calls
}

/**
 * Get admin token
 * Note: Admin token is in HttpOnly cookie, not accessible from JavaScript
 * This function is kept for compatibility but returns null
 */
export function getAdminToken(): string | null {
  // Can't read HttpOnly cookies from JavaScript
  return null;
}

