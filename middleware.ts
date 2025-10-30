import { NextRequest, NextResponse } from 'next/server';

export function middleware(request: NextRequest) {
  // Check if the request is for admin routes
  if (request.nextUrl.pathname.startsWith('/admin')) {
    // Skip authentication check for the auth API endpoint
    if (request.nextUrl.pathname === '/api/admin/auth' || request.nextUrl.pathname === '/api/admin/backfill-images') {
      return NextResponse.next();
    }
    
    // Check for admin session cookie
    const adminSession = request.cookies.get('adminSession');
    
    if (!adminSession || adminSession.value !== 'authenticated') {
      // If it's an API route, return 401
      if (request.nextUrl.pathname.startsWith('/api/')) {
        return NextResponse.json(
          { error: 'Unauthorized' },
          { status: 401 }
        );
      }
      
      // For page routes, redirect to admin login (which will show the auth form)
      return NextResponse.next();
    }
  }
  
  return NextResponse.next();
}

export const config = {
  matcher: [
    '/admin/:path*',
    '/api/admin/:path*'
  ]
};
