import { NextResponse } from 'next/server'
import { prisma } from '../../../../server/prisma'
import fs from 'node:fs'
import path from 'node:path'
import { markStart, logIfSlow } from '../../../../lib/timing'

// Simple per-slug cache
const CACHE = new Map<string, { ts: number; data: any }>()
const TTL = 300_000 // 5 minutes

function getCached(slug: string) {
  const c = CACHE.get(slug)
  if (!c) return null
  if (Date.now() - c.ts > TTL) { CACHE.delete(slug); return null }
  return c.data
}
function setCached(slug: string, data: any) {
  CACHE.set(slug, { ts: Date.now(), data })
}

export async function GET(_req: Request, { params }: { params: { slug: string } }) {
  const start = markStart()
  const slug = params.slug
  if (!slug) return NextResponse.json({ error: 'missing slug' }, { status: 400 })

  const fromCache = getCached(slug)
  if (fromCache) return NextResponse.json(fromCache, { headers: { 'Cache-Control': 's-maxage=300, max-age=60' } })

  const useFile = (process.env.USE_FILE_DB || 'false').toLowerCase() === 'true'
  if (!useFile) {
    try {
      const p = await prisma.product.findUnique({
        where: { slug },
        include: { brand: true, media: true, prices: { orderBy: { createdAt: 'desc' }, take: 1 } }
      })
      if (p) {
        const shaped = {
          slug: p.slug,
          name: p.name,
          price: p.prices?.[0]?.amount ?? null,
          brand: p.brand?.name ?? null,
          imageUrl: p.media?.[0]?.url ?? null,
          images: (p.media || []).map((m: any) => m.url)
        }
        setCached(slug, shaped)
        const resp = NextResponse.json(shaped, { headers: { 'Cache-Control': 's-maxage=300, max-age=60' } })
        logIfSlow('api/product:db', start, 500, { slug })
        return resp
      }
    } catch {}
  }

  try {
    const file = path.join(process.cwd(), 'data', 'products.json')
    const arr: any[] = JSON.parse(fs.readFileSync(file, 'utf8'))
    const fp = arr.find((x) => x.slug === slug)
    if (!fp) return NextResponse.json({ error: 'not found' }, { status: 404 })
    const shaped = {
      slug: fp.slug,
      name: fp.name,
      price: fp.price ?? null,
      brand: fp.brand ?? null,
      imageUrl: fp.imageUrl ?? null,
      images: Array.isArray(fp.images) ? fp.images.filter((s: any) => typeof s === 'string') : (fp.imageUrl ? [fp.imageUrl] : [])
    }
    setCached(slug, shaped)
    const resp = NextResponse.json(shaped, { headers: { 'Cache-Control': 's-maxage=300, max-age=60' } })
    logIfSlow('api/product:file', start, 500, { slug })
    return resp
  } catch (e) {
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
}
