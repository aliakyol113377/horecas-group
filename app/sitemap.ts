import type { MetadataRoute } from 'next'
import fs from 'node:fs'
import path from 'node:path'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.NEXT_PUBLIC_SITE_URL || 'https://horecas-group.example'
  const entries: MetadataRoute.Sitemap = [
    { url: `${base}/ru`, lastModified: new Date() },
    { url: `${base}/ru/catalog`, lastModified: new Date() },
    { url: `${base}/ru/about`, lastModified: new Date() },
    { url: `${base}/ru/contacts`, lastModified: new Date() }
  ]
  // Try include product pages if DB is reachable
  try {
    // Lazy import prisma to avoid build-time initialization failures on Vercel
    const { prisma } = await import('../server/prisma')
    const products = await prisma.product.findMany({ select: { slug: true }, take: 1000, orderBy: { createdAt: 'desc' } })
    for (const p of products) {
      entries.push({ url: `${base}/ru/product/${p.slug}`, lastModified: new Date() })
    }
  } catch {
    // Fallback to file DB
    try {
      const file = path.join(process.cwd(), 'data', 'products.json')
      const arr: any[] = JSON.parse(fs.readFileSync(file, 'utf8'))
      const items = arr.slice(0, 1000)
      for (const p of items) entries.push({ url: `${base}/ru/product/${p.slug}`, lastModified: new Date(p.createdAt || Date.now()) })
    } catch {}
  }
  return entries
}
