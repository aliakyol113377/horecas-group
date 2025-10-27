import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const locales = ['ru', 'kk']
const defaultLocale = 'ru'

function getLocale(request: NextRequest) {
  const cookie = request.cookies.get('NEXT_LOCALE')?.value
  if (cookie && locales.includes(cookie)) return cookie
  return defaultLocale
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  // Skip public files and api
  if (
    pathname.startsWith('/api') ||
    pathname.startsWith('/_next') ||
    pathname.includes('.')
  ) {
    return
  }

  // If path already includes a locale, continue
  const pathLocale = pathname.split('/')[1]
  if (locales.includes(pathLocale)) {
    // Basic auth for admin area: /{lng}/admin
    const pathAfterLocale = pathname.split('/')[2] || ''
    if (pathAfterLocale === 'admin') {
      const auth = request.headers.get('authorization') || ''
      const expectedUser = process.env.ADMIN_USER || ''
      const expectedPass = process.env.ADMIN_PASS || ''
      const unauthorized = () => new NextResponse('Unauthorized', {
        status: 401,
        headers: { 'WWW-Authenticate': 'Basic realm="Restricted"' }
      })
      if (!expectedUser || !expectedPass) {
        return unauthorized()
      }
      if (!auth.startsWith('Basic ')) {
        return unauthorized()
      }
      try {
        const decoded = Buffer.from(auth.slice(6), 'base64').toString('utf8')
        const [u, p] = decoded.split(':')
        if (u !== expectedUser || p !== expectedPass) {
          return unauthorized()
        }
      } catch {
        return unauthorized()
      }
    }
    return NextResponse.next()
  }

  // Redirect to locale-prefixed path
  const locale = getLocale(request)
  const url = request.nextUrl.clone()
  url.pathname = `/${locale}${pathname}`
  return NextResponse.redirect(url)
}

export const config = {
  matcher: ['/((?!.*\.).*)']
}
