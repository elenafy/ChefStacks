import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { SupabaseDB } from '@/lib/supabase-db'

export async function POST(req: NextRequest) {
  try {
    // Require admin session via middleware cookie; also allow ADMIN_PASSWORD for safety
    const adminPassword = process.env.ADMIN_PASSWORD
    const body = await req.json().catch(() => ({}))
    if (adminPassword && body?.password && body.password !== adminPassword) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!process.env.SUPABASE_SECRET_KEY) {
      return NextResponse.json({ error: 'Server storage key not configured' }, { status: 500 })
    }

    const ids: string[] = Array.isArray(body?.ids) ? body.ids : []
    if (ids.length === 0) {
      return NextResponse.json({ error: 'No ids provided' }, { status: 400 })
    }

    const db = new SupabaseDB()
    const supa = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SECRET_KEY!
    )

    // Ensure bucket exists (idempotent)
    try {
      // @ts-ignore types may vary by SDK version
      await supa.storage.createBucket('recipe-images', { public: true, fileSizeLimit: 10485760, allowedMimeTypes: ['image/jpeg','image/png','image/webp'] } as any)
    } catch {}

    const results: any[] = []
    for (const id of ids) {
      try {
        const recipe = await db.getRecipe(id)
        if (!recipe) {
          results.push({ id, status: 'not_found' })
          continue
        }
        const image = (recipe as any).images?.[0] || (recipe as any).content_json?.image
        if (!image || typeof image !== 'string' || !(image.startsWith('http://') || image.startsWith('https://'))) {
          results.push({ id, status: 'skipped_no_external_image' })
          continue
        }
        const u = new URL(image)
        const isTikTok = /tiktok/i.test(u.hostname)
        const referer = isTikTok ? 'https://www.tiktok.com/' : `${u.protocol}//${u.host}`
        const accept = 'image/webp,image/jpeg,image/png;q=0.9,*/*;q=0.8'
        const userAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
        let sourceUrl = image
        let resp = await fetch(sourceUrl, { headers: { 'Referer': referer, 'Accept': accept, 'User-Agent': userAgent, ...(isTikTok ? { 'Origin': 'https://www.tiktok.com' } : {}) }, redirect: 'follow', cache: 'no-store' })
        // Fallback for TikTok: try oEmbed thumbnail when signed CDN returns 403
        if (!resp.ok && isTikTok) {
          try {
            const o = await fetch(`https://www.tiktok.com/oembed?url=${encodeURIComponent((recipe as any).content_json?.tiktok?.url || (recipe as any).content_json?.web?.url || '')}`)
            if (o.ok) {
              const data = await o.json()
              if (data?.thumbnail_url) {
                sourceUrl = String(data.thumbnail_url)
                resp = await fetch(sourceUrl, { headers: { 'Referer': 'https://www.tiktok.com/', 'Accept': accept, 'User-Agent': userAgent, 'Origin': 'https://www.tiktok.com' }, redirect: 'follow', cache: 'no-store' })
              }
            }
          } catch {}
        }
        if (!resp.ok) { results.push({ id, status: 'fetch_failed', http: resp.status }); continue }
        const contentType = resp.headers.get('content-type') || 'image/jpeg'
        const ab = await resp.arrayBuffer()
        const ext = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg'
        const key = `recipes/${id}.${ext}`
        const { error: upErr } = await supa.storage.from('recipe-images').upload(key, new Blob([ab], { type: contentType }), { upsert: true, contentType })
        if (upErr) {
          results.push({ id, status: 'upload_failed', error: upErr.message })
          continue
        }
        const { data: pub } = supa.storage.from('recipe-images').getPublicUrl(key)
        const publicUrl = pub?.publicUrl
        if (!publicUrl) {
          results.push({ id, status: 'public_url_missing' })
          continue
        }
        // Update recipe
        const updatedContent = { ...(recipe as any).content_json, image: publicUrl }
        const { error: updErr } = await supa.from('recipes').update({ images: [publicUrl], content_json: updatedContent }).eq('id', id)
        if (updErr) {
          results.push({ id, status: 'db_update_failed', error: updErr.message })
          continue
        }
        results.push({ id, status: 'ok', url: publicUrl })
      } catch (e: any) {
        results.push({ id, status: 'error', error: e?.message || String(e) })
      }
    }

    return NextResponse.json({ success: true, results })
  } catch (e) {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}


