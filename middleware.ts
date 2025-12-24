import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Daftar domain yang diizinkan untuk mengakses API
// Tambahkan domain Hostinger Anda di sini
const ALLOWED_ORIGINS = [
  // Production domains
  process.env.FRONTEND_URL || '',
  // Development
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:3002',
].filter(Boolean); // Remove empty strings

function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false;

  // Check exact match
  if (ALLOWED_ORIGINS.includes(origin)) return true;

  // Check from environment variable (comma-separated list)
  const envOrigins = process.env.ALLOWED_ORIGINS?.split(',').map(o => o.trim()) || [];
  if (envOrigins.includes(origin)) return true;

  return false;
}

function corsHeaders(origin: string | null): HeadersInit {
  const headers: HeadersInit = {
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS, PATCH',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, Accept, Origin, X-API-Key, x-client-info, x-supabase-auth',
    'Access-Control-Max-Age': '86400', // 24 hours
    'Access-Control-Allow-Credentials': 'true',
  };

  // Only set Allow-Origin if origin is allowed
  if (origin && isAllowedOrigin(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
  }

  return headers;
}

export function middleware(request: NextRequest) {
  const origin = request.headers.get('origin');
  const pathname = request.nextUrl.pathname;

  // Handle preflight requests (OPTIONS)
  if (request.method === 'OPTIONS') {
    return new NextResponse(null, {
      status: 200,
      headers: corsHeaders(origin),
    });
  }

  // Continue with the request
  const response = NextResponse.next();

  // Add CORS headers for API routes
  if (pathname.startsWith('/api')) {
    const headers = corsHeaders(origin);
    Object.entries(headers).forEach(([key, value]) => {
      response.headers.set(key, value as string);
    });
  }

  // Security headers for all routes
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-XSS-Protection', '1; mode=block');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all API routes for CORS handling
     * Also match OPTIONS requests for preflight
     */
    '/api/:path*',
  ],
};