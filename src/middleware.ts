import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  
  // Public routes that don't need auth
  const publicRoutes = ['/login', '/api', '/_next', '/favicon.ico', '/manifest.json', '/sw.js', '/icons'];
  if (publicRoutes.some(r => pathname.startsWith(r))) {
    return NextResponse.next();
  }

  // Check token from cookie or header
  const token = request.cookies.get('openmate-token')?.value;
  
  // If no token, redirect to login
  if (!token) {
    // For initial page loads, let the client-side handle redirect
    // since tokens are stored in localStorage
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
