import * as cheerio from 'cheerio'
import slugify from 'slugify'

export function parseCategorySlugFromUrl(u) {
  try {
    const p = new URL(u).pathname
    const parts = p.split('/').filter(Boolean)
    const idx = parts.indexOf('catalog')
    if (idx >= 0 && parts[idx + 1]) return parts[idx + 1]
  } catch {}
  return 'catalog'
}

export function parseProductHtml(url, html) {
  const $ = cheerio.load(html)
  const name = $('h1').first().text().trim() || 'Товар'
  const description = $('meta[name="description"]').attr('content') || ''
  const priceText = $('[class*="price"], .price, .product-price').first().text().replace(/[^\d]/g, '')
  const price = Number(priceText || '0')
  const imageUrl = $('img').first().attr('src') || ''
  const brand = $('a[href*="brand"], .brand').first().text().trim() || ''
  const material = $(':contains("Материал")').next().text().trim() || ''
  const color = $(':contains("Цвет")').next().text().trim() || ''
  const categorySlug = parseCategorySlugFromUrl(url)
  const slug = slugify(name, { lower: true, strict: true, locale: 'ru' })
  return { name, description, price, imageUrl, brand, material, color, slug, supplierUrl: url, categorySlug, priceRaw: priceText }
}
