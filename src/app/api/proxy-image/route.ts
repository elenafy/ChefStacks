import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const url = searchParams.get('url')
    if (!url) {
      return new NextResponse('Missing url', { status: 400 })
    }

    // Basic allowlist: only http/https
    const u = new URL(url)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') {
      return new NextResponse('Invalid protocol', { status: 400 })
    }

    // Prefer a site-specific Referer for strict CDNs (e.g., TikTok)
    const isTikTok = /tiktok/i.test(u.hostname)
    const referer = isTikTok ? 'https://www.tiktok.com/' : `${u.protocol}//${u.host}`
    // Request formats widely supported by browsers to avoid AVIF-only responses on older Safari
    const accept = 'image/webp,image/jpeg,image/png;q=0.9,*/*;q=0.8'
    // Use a common desktop User-Agent to bypass overly strict UA checks
    const userAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

    const resp = await fetch(url, {
      headers: {
        'Referer': referer,
        'Accept': accept,
        'User-Agent': userAgent,
        ...(isTikTok ? { 'Origin': 'https://www.tiktok.com' } : {}),
      },
      // Ensure we actually hit origin for freshness; CDN caching handled by our response headers
      cache: 'no-store',
      redirect: 'follow',
    })

    if (!resp.ok) {
      return new NextResponse('Upstream fetch failed', { status: 502 })
    }

    const contentType = resp.headers.get('content-type') || 'image/jpeg'
    const body = resp.body
    if (!body) {
      return new NextResponse('No body', { status: 502 })
    }

    return new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        // Cache at the edge for 1 hour, allow stale for a day
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
        // Allow cross-origin usage in <img> across browsers
        'Access-Control-Allow-Origin': '*',
      },
    })
  } catch (e) {
    return new NextResponse('Internal error', { status: 500 })
  }
}


