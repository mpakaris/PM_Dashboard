import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { parseSession } from '@/lib/auth';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const sessionValue = request.cookies.get('session')?.value;
  const role = await parseSession(sessionValue);

  if (pathname === '/login') {
    if (role) return NextResponse.redirect(new URL('/', request.url));
    return NextResponse.next();
  }

  if (!role) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
