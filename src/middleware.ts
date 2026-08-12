import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { parseSession } from '@/lib/auth';
import { LOCALE_KEY, DEFAULT_LOCALE, LOCALES } from '@/lib/i18n';

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

  const response = NextResponse.next();

  // Seed locale cookie on first visit — client-side toggle updates it afterwards
  const raw = request.cookies.get(LOCALE_KEY)?.value ?? '';
  if (!LOCALES.includes(raw as any)) {
    response.cookies.set(LOCALE_KEY, DEFAULT_LOCALE, { path: '/', maxAge: 60 * 60 * 24 * 365 });
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
