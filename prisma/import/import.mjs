import fs from 'node:fs'
import path from 'node:path'
import { XMLParser } from 'fast-xml-parser'
import pLimit from 'p-limit'
import * as cheerio from 'cheerio'
import fs from 'node:fs'
import path from 'node:path'
import { XMLParser } from 'fast-xml-parser'
import pLimit from 'p-limit'
import * as cheerio from 'cheerio'
import slugify from 'slugify'
import sharp from 'sharp'
import { fileURLToPath } from 'node:url'
import zlib from 'node:zlib'
import { PrismaClient } from '@prisma/client'

let prisma = null

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const BASE_URL = process.env.IMPORT_BASE_URL || 'https://complex-bar.kz'
const SITEMAP_URL = process.env.IMPORT_SITEMAP_URL || `${BASE_URL}/sitemap.xml`
const IMPORT_STRATEGY = (process.env.IMPORT_STRATEGY || 'crawl').toLowerCase() // 'crawl' | 'sitemap'
const IGNORE_ROBOTS = (process.env.IMPORT_IGNORE_ROBOTS || 'false').toLowerCase() === 'true'
// Accept alternate env var names IMPORT_BATCH and IMPORT_CONCURRENCY
const BATCH_SIZE = Number(process.env.IMPORT_BATCH_SIZE || process.env.IMPORT_BATCH || '50')
const CONCURRENCY = Number(process.env.IMPORT_RATE_LIMIT_CONCURRENCY || process.env.IMPORT_CONCURRENCY || '4')
const SAVE_DIR = process.env.IMPORT_SAVE_IMAGES_DIR || path.join(process.cwd(), 'public/imported')
// Optional URL prefix filter to restrict import scope
let URL_PREFIX = process.env.IMPORT_URL_PREFIX || '/catalog/'
try {
  if (process.env.SUPPLIER_URL) {
    const u = new URL(process.env.SUPPLIER_URL)
    URL_PREFIX = u.pathname.endsWith('/') ? u.pathname : `${u.pathname}/`
  }
} catch {}

const isDryRun = process.argv.includes('--dry-run')
const IMPORT_MODE = (process.env.IMPORT_MODE || 'db').toLowerCase() // 'db' | 'file'
const FILE_DB_DIR = process.env.FILE_DB_DIR || path.join(process.cwd(), 'data')
fs.mkdirSync(FILE_DB_DIR, { recursive: true })
const DRY_RUN_LIMIT = Number(process.env.DRY_RUN_LIMIT || '200')
const LOGS_DIR = path.join(process.cwd(), 'logs')
const TS = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)
const LOG_FILE = path.join(LOGS_DIR, `import_run_${TS}.log`)
fs.mkdirSync(LOGS_DIR, { recursive: true })

const categoriesMap = new Map() // slug -> { slug, name, parentSlug }

function logLine(...args) {
  const line = `[${new Date().toISOString()}] ${args.join(' ')}\n`
  fs.appendFileSync(LOG_FILE, line)
  console.log(...args)
}

function delay(ms) { return new Promise((res) => setTimeout(res, ms)) }

async function fetchText(url, retries = 3, backoffMs = 400) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'user-agent': 'horecas-group-importer' } })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const ct = res.headers.get('content-type') || ''
      const ce = res.headers.get('content-encoding') || ''
      const isGz = url.endsWith('.gz') || /gzip/i.test(ce) || /application\/x-gzip/i.test(ct)
      if (isGz) {
        const buf = Buffer.from(await res.arrayBuffer())
        const out = zlib.gunzipSync(buf)
        return out.toString('utf8')
      }
      return await res.text()
    } catch (e) {
      if (attempt === retries) throw new Error(`${e.message} ${url}`)
      await delay(backoffMs * Math.pow(2, attempt))
    }
  }
}
  console.log(...args)
}

function delay(ms) { return new Promise((res) => setTimeout(res, ms)) }

async function fetchText(url, retries = 3, backoffMs = 400) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'user-agent': 'horecas-group-importer' } })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const ct = res.headers.get('content-type') || ''
      const ce = res.headers.get('content-encoding') || ''
      const isGz = url.endsWith('.gz') || /gzip/i.test(ce) || /application\/x-gzip/i.test(ct)
      if (isGz) {
        const buf = Buffer.from(await res.arrayBuffer())
        const out = zlib.gunzipSync(buf)
        return out.toString('utf8')
      }
    categorySlug: p.categorySlug || null,
    subcategorySlug: p.subcategorySlug || null,
    } catch (e) {
      if (attempt === retries) throw new Error(`${e.message} ${url}`)
      await delay(backoffMs * Math.pow(2, attempt))
    }
  }
}

  // Write categories file in file-DB mode
  if (IMPORT_MODE === 'file') {
    try {
      const cats = Array.from(categoriesMap.values())
      const out = path.join(FILE_DB_DIR, 'categories.json')
      fs.writeFileSync(out, JSON.stringify(cats, null, 2), 'utf8')
      logLine(`Сохранены категории: ${cats.length}`)
    } catch (e) {
      logLine('ERR categories write', e.message || String(e))
    }
  }
async function getProductUrls() {
  const xml = await fetchText(SITEMAP_URL)
  const parser = new XMLParser({ ignoreAttributes: false })
  const data = parser.parse(xml)
  const sitemaps = []
  // Handle index or single sitemap
  if (data.sitemapindex?.sitemap) {
    const nodes = Array.isArray(data.sitemapindex.sitemap) ? data.sitemapindex.sitemap : [data.sitemapindex.sitemap]
    for (const sm of nodes) if (sm?.loc) sitemaps.push(sm.loc)
  } else if (data.urlset?.url) {
    const urls = Array.isArray(data.urlset.url) ? data.urlset.url : [data.urlset.url]
    return urls
      .map((u) => u.loc)
      .filter((u) => {
        try { return new URL(u).pathname.startsWith(URL_PREFIX) } catch { return u.includes(URL_PREFIX) }
      })
  }
  const urls = new Set()
  for (const smUrl of sitemaps) {
  const smXml = await fetchText(smUrl)
    const smData = parser.parse(smXml)
    const nodes = smData.urlset?.url
    const list = nodes ? (Array.isArray(nodes) ? nodes : [nodes]) : []
    for (const u of list) {
      const loc = u.loc
      let ok = false
      try { ok = new URL(loc).pathname.startsWith(URL_PREFIX) } catch { ok = loc.includes(URL_PREFIX) }
      if (ok) urls.add(loc)
    }
  }
  return Array.from(urls)
}

async function discoverProductUrlsByCrawl(startUrl) {
  const visited = new Set()
  const queue = [startUrl]
  const productUrls = new Set()
  const limit = pLimit(Math.max(1, Math.min(CONCURRENCY, 6)))

  function normalizeUrl(u) {
    try {
      const x = new URL(u, BASE_URL)
      return x.href
    } catch { return null }
  }

  async function processPage(url) {
    const html = await fetchText(url)
    const $ = cheerio.load(html)
    // detect product via schema.org Product (microdata or JSON-LD)
    const hasProductSchema = $('[itemtype*=\"Product\"]').length > 0
    let hasProductLd = false
    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        const txt = $(el).contents().text()
        if (txt && /"@type"\s*:\s*"Product"/i.test(txt)) hasProductLd = true
      } catch {}
    })
    const isProduct = hasProductSchema || hasProductLd
    if (isProduct) {
      productUrls.add(url)
    }
    // collect links under URL_PREFIX
    $('a[href]').each((_, el) => {
      const href = $(el).attr('href')
      const abs = normalizeUrl(href)
      if (!abs) return
      try {
        const p = new URL(abs)
        if (!p.pathname.startsWith(URL_PREFIX)) return
        // avoid mailto, anchors
        if (abs.startsWith('mailto:') || abs.startsWith('tel:') || abs.includes('#')) return
        // limit path depth to reduce explosion
        const depth = p.pathname.split('/').filter(Boolean).length
        if (depth > 8) return
        if (!visited.has(abs)) queue.push(abs)
      } catch {}
    })
  }

  while (queue.length) {
    const batch = []
    while (batch.length < CONCURRENCY && queue.length) {
      const next = queue.shift()
      if (next && !visited.has(next)) {
        visited.add(next)
        batch.push(next)
      }
    }
    if (!batch.length) break
    await Promise.all(batch.map((u) => limit(() => processPage(u).catch(() => undefined))))
    // Soft cap to avoid runaway crawl
    if (visited.size > 5000) break
  }
  const result = Array.from(productUrls)
  return isDryRun && DRY_RUN_LIMIT > 0 ? result.slice(0, DRY_RUN_LIMIT) : result
}

async function crawlForProducts(startUrl) {
  const visited = new Set()
  const queue = [startUrl]
  const products = new Map() // key by URL
  const limit = pLimit(Math.max(1, Math.min(CONCURRENCY, 6)))

  function normalizeUrl(u) {
    try { return new URL(u, BASE_URL).href } catch { return null }
  }

  async function processPage(url) {
    const html = await fetchText(url)
    const $ = cheerio.load(html)
    // If page itself looks like a product, parse it directly
    let hasProductLd = false
    $('script[type="application/ld+json"]').each((_, el) => {
      try { const t = $(el).contents().text(); if (t && /"@type"\s*:\s*"Product"/i.test(t)) hasProductLd = true } catch {}
    })
    const hasProductMicro = $('[itemtype*="Product"]').length > 0
    if (hasProductLd || hasProductMicro) {
      try {
        const parsed = await parseProductPage(url)
        if (parsed?.name) {
          products.set(url, parsed)
          return
        }
      } catch {}
    }
  // Otherwise, try to parse listing tiles (image + title, price optional)
    const candidates = []
    $('a[href] img').each((_, img) => {
      const a = $(img).closest('a')
      const href = a.attr('href')
      const abs = normalizeUrl(href)
      if (!abs) return
      try {
        const u = new URL(abs)
        if (!u.pathname.startsWith(URL_PREFIX)) return
        const node = a.closest('[class*="product"], [class*="card"], li, .item, .catalog, .grid, .col')
        const name = ($(img).attr('alt') || a.attr('title') || node.find('h2,h3').first().text() || '').trim()
        if (!name) return
        const priceText = (node.find('[class*="price"], .price, .product-price, [itemprop="price"]').first().text() || node.find('[itemprop="price"]').attr('content') || '').trim()
        const numeric = (priceText || '').replace(/[^\d]/g, '')
        const price = numeric ? Number(numeric) : 0
        const src = $(img).attr('src') || ''
        candidates.push({ url: abs, name, price, imageUrl: src })
      } catch {}
    })
    for (const c of candidates) {
      if (!products.has(c.url)) products.set(c.url, c)
    }
    // Collect more links to traverse (pagination, subcategories) and sample-parse some anchors
    const anchors = new Set()
    $('a[href]').each((_, el) => {
      const href = $(el).attr('href')
      const abs = normalizeUrl(href)
      if (!abs) return
      try {
        const p = new URL(abs)
        if (!p.pathname.startsWith(URL_PREFIX)) return
        if (abs.startsWith('mailto:') || abs.startsWith('tel:') || abs.includes('#')) return
        const depth = p.pathname.split('/').filter(Boolean).length
        if (depth > 8) return
        anchors.add(abs)
        if (!visited.has(abs)) queue.push(abs)
      } catch {}
    })

    // Sample-parse a few anchors as potential product pages
    const sample = Array.from(anchors).slice(0, 15)
    await Promise.all(sample.map(async (href) => {
      if (products.has(href)) return
      try {
        const parsed = await parseProductPage(href)
        if (parsed?.name && parsed.name.length > 3) {
          // Heuristic: accept if price parsed or description present
          if ((parsed.price && parsed.price > 0) || (parsed.description && parsed.description.length > 20)) {
            products.set(href, parsed)
          }
        }
      } catch {}
    }))
  }

  while (queue.length) {
    const batch = []
    while (batch.length < CONCURRENCY && queue.length) {
      const next = queue.shift()
      if (next && !visited.has(next)) { visited.add(next); batch.push(next) }
    }
    if (!batch.length) break
    await Promise.all(batch.map((u) => limit(() => processPage(u).catch(() => undefined))))
    if (visited.size > 2000 || products.size > 5000) break
    if (isDryRun && DRY_RUN_LIMIT > 0 && products.size >= DRY_RUN_LIMIT) break
  }
  const out = Array.from(products.values()).map((c) => {
    const slug = slugify(c.name, { lower: true, strict: true, locale: 'ru' })
    return { name: c.name, description: '', price: c.price, imageUrl: c.imageUrl, brand: '', material: '', color: '', slug, supplierUrl: c.url, categorySlug: parseCategorySlugFromUrl(c.url), priceRaw: String(c.price) }
  })
  return out
}

function prettifySlug(s) {
  return s.replace(/[-_]+/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase())
}

function parseCategoryAndSubcategoryFromUrl(u) {
  try {
    const p = new URL(u).pathname
    const parts = p.split('/').filter(Boolean)
    const idx = parts.indexOf('catalog')
    if (idx >= 0 && parts[idx + 1]) {
      const categorySlug = parts[idx + 1]
      const subcategorySlug = parts[idx + 2] || null
      const categoryPath = parts.slice(idx + 1, idx + 1 + (parts[idx + 2] ? 2 : 1))
      return { categorySlug, subcategorySlug, categoryPath }
    }
  } catch {}
  const tail = URL_PREFIX.replace(/^\/+|\/+$/g, '').split('/')
  const categorySlug = tail.pop() || 'catalog'
  return { categorySlug, subcategorySlug: null, categoryPath: [categorySlug] }
}

function parseBreadcrumbs($) {
  const out = []
  try {
    // JSON-LD BreadcrumbList
    let found = false
    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        const txt = $(el).contents().text()
        if (!txt) return
        const data = JSON.parse(txt)
        const list = Array.isArray(data) ? data : [data]
        for (const item of list) {
          if (item['@type'] === 'BreadcrumbList' && Array.isArray(item.itemListElement)) {
            for (const e of item.itemListElement) {
              const href = e.item?.id || e.item?.['@id'] || e.item?.url || e.item
              const name = e.name || e.item?.name
              const info = parseCategoryAndSubcategoryFromUrl(href || '')
              const slug = info.categoryPath?.slice(-1)[0]
              if (slug && name && slug !== 'catalog') out.push({ slug, name })
            }
            found = true
          }
        }
      } catch {}
    })
    if (found && out.length) return out
    // Microdata
    const items = $('[itemtype*="BreadcrumbList"] [itemprop="itemListElement"]')
    if (items.length) {
      items.each((_, el) => {
        const a = $(el).find('a, [itemprop="item"]').first()
        const name = a.attr('title') || a.text()
        const href = a.attr('href') || a.attr('content')
        const info = parseCategoryAndSubcategoryFromUrl(href || '')
        const slug = info.categoryPath?.slice(-1)[0]
        if (slug && name && slug !== 'catalog') out.push({ slug, name: name.trim() })
      })
      if (out.length) return out
    }
    // Common classes
    const links = $('.breadcrumb a, nav[aria-label*="bread"] a')
    if (links.length) {
      links.each((_, el) => {
        const a = $(el)
        const name = a.attr('title') || a.text()
        const href = a.attr('href')
        const info = parseCategoryAndSubcategoryFromUrl(href || '')
        const slug = info.categoryPath?.slice(-1)[0]
        if (slug && name && slug !== 'catalog') out.push({ slug, name: name.trim() })
      })
    }
  } catch {}
  return out
}

async function parseProductPage(url) {
  const html = await fetchText(url)
  const $ = cheerio.load(html)
  const { categorySlug: catFromUrl, subcategorySlug: subFromUrl, categoryPath } = parseCategoryAndSubcategoryFromUrl(url)
  const name = ($('h1').first().text() || $('[itemprop="name"]').first().text() || '').trim() || 'Товар'
  const description = (
    $('meta[name="description"]').attr('content') ||
    $('[itemprop="description"]').first().text() ||
    $('meta[property="og:description"]').attr('content') ||
    ''
  )
  // Price: try content attr first, then text
  let priceText = $('[itemprop="price"]').attr('content') || ''
  if (!priceText) {
    priceText = ($('[class*="price"], .price, .product-price, [data-price]').first().attr('data-price') ||
      $('[class*="price"], .price, .product-price').first().text() || '').replace(/[^\d]/g, '')
  }
  const price = Number(priceText || '0')
  // Image: prefer OG or itemprop image
  const imageUrl = (
    $('meta[property="og:image"]').attr('content') ||
    $('[itemprop="image"]').attr('src') ||
    $('img[loading="lazy"]').first().attr('src') ||
    $('img').first().attr('src') ||
    ''
  )
  const brand = ($('[itemprop="brand"]').first().text() || $('a[href*="brand"], .brand').first().text() || '').trim()
  const material = ($('td:contains("Материал")').next().text() || $(':contains("Материал")').next().text() || '').trim()
  const color = ($('td:contains("Цвет")').next().text() || $(':contains("Цвет")').next().text() || '').trim()
  // Register categories into map using breadcrumbs if present, else from URL path
  const crumbs = parseBreadcrumbs($)
  if (crumbs.length) {
    let parent = null
    for (const c of crumbs) {
      if (!categoriesMap.has(c.slug)) categoriesMap.set(c.slug, { slug: c.slug, name: c.name, parentSlug: parent })
      parent = c.slug
    }
  } else {
    for (let i = 0; i < categoryPath.length; i++) {
      const slug = categoryPath[i]
      const parentSlug = i > 0 ? categoryPath[i - 1] : null
      if (!categoriesMap.has(slug)) categoriesMap.set(slug, { slug, name: prettifySlug(slug), parentSlug })
    }
  }
  const categorySlug = catFromUrl
  const subcategorySlug = subFromUrl

  const slug = slugify(name, { lower: true, strict: true, locale: 'ru' })
  return { name, description, price, imageUrl, brand, material, color, slug, supplierUrl: url, categorySlug, subcategorySlug, priceRaw: priceText }
}

async function downloadAndOptimizeImage(srcUrl, destBaseName) {
  try {
    const res = await fetch(srcUrl)
    if (!res.ok) throw new Error('image fetch failed')
    const buf = Buffer.from(await res.arrayBuffer())
    const outDir = SAVE_DIR
    fs.mkdirSync(outDir, { recursive: true })
    const sizes = [480, 768, 1024]
    const outputs = []
    for (const w of sizes) {
      const out = path.join(outDir, `${destBaseName}-${w}.webp`)
      await sharp(buf).resize(w).webp({ quality: 82 }).toFile(out)
      outputs.push(`/imported/${destBaseName}-${w}.webp`)
    }
    return outputs[1] || outputs[0] || null
  } catch (e) {
    return null
  }
}

async function writeProductToFile(p) {
  const file = path.join(FILE_DB_DIR, 'products.json')
  let arr = []
  try { arr = JSON.parse(fs.readFileSync(file, 'utf8')) } catch {}
  const idx = arr.findIndex((x) => x.slug === p.slug)
  const now = new Date().toISOString()
  const rec = {
    id: p.slug,
    slug: p.slug,
    name: p.name,
    description: p.description || '',
    brand: p.brand || null,
    price: p.price || null,
    imageUrl: p.imageLocal || null,
    material: p.material || null,
    color: p.color || null,
    categorySlug: p.categorySlug || null,
    createdAt: arr[idx]?.createdAt || now
  }
  if (idx >= 0) arr[idx] = rec; else arr.push(rec)
  fs.writeFileSync(file, JSON.stringify(arr, null, 2), 'utf8')
}

async function upsertProduct(p) {
  if (isDryRun) return null
  if (IMPORT_MODE === 'file') {
    await writeProductToFile(p)
    return
  }
  if (!prisma) prisma = new PrismaClient()
  let brand = null
  if (p.brand) {
    brand = await prisma.brand.upsert({
      where: { slug: slugify(p.brand, { lower: true, strict: true }) },
      update: { name: p.brand },
      create: { name: p.brand, slug: slugify(p.brand, { lower: true, strict: true }) }
    })
  }
  const product = await prisma.product.upsert({
    where: { slug: p.slug },
    update: {
      name: p.name,
      description: p.description,
      brandId: brand?.id || null,
      material: p.material || null,
      color: p.color || null
    },
    create: {
      slug: p.slug,
      name: p.name,
      description: p.description,
      brandId: brand?.id || null,
      material: p.material || null,
      color: p.color || null
    }
  })

  if (p.price && p.price > 0) {
    await prisma.price.create({ data: { productId: product.id, amount: p.price } })
  }

  if (p.imageLocal) {
    await prisma.media.create({ data: { productId: product.id, url: p.imageLocal, alt: p.name } })
  }

  await prisma.supplierRef.upsert({
    where: { url: p.supplierUrl },
    update: { productId: product.id },
    create: { url: p.supplierUrl, productId: product.id }
  })
}

async function main() {
  logLine('Импорт каталога: старт')
  if (!IGNORE_ROBOTS) {
    try {
      const txt = await fetchText(`${BASE_URL}/robots.txt`)
      if (/Disallow:\s*\//.test(txt)) {
        logLine('robots.txt блокирует обход. Установите IMPORT_IGNORE_ROBOTS=true для продолжения.')
        process.exit(1)
      }
    } catch { /* ignore */ }
  }

  let urls = []
  if (IMPORT_STRATEGY === 'sitemap') {
    urls = await getProductUrls()
    logLine(`Всего URL: ${urls.length}`)
    const limited = isDryRun && DRY_RUN_LIMIT > 0 ? urls.slice(0, DRY_RUN_LIMIT) : urls
    const limit = pLimit(CONCURRENCY)
    for (let i = 0; i < limited.length; i += BATCH_SIZE) {
      const batch = limited.slice(i, i + BATCH_SIZE)
      logLine(`Пакет ${i / BATCH_SIZE + 1}: ${batch.length} URL`)
      await Promise.all(
        batch.map((url) => limit(async () => {
          try {
            const parsed = await parseProductPage(url)
            const imageLocal = parsed.imageUrl ? await downloadAndOptimizeImage(parsed.imageUrl, parsed.slug) : null
            if (isDryRun) {
              logLine('DRY', JSON.stringify({
                supplier_url: url,
                title: parsed.name,
                main_image_url: parsed.imageUrl,
                price_raw: parsed.priceRaw,
                parsed_price_kzt: parsed.price,
                category_slug: parsed.categorySlug,
                status: 'ok'
              }))
            } else {
              await upsertProduct({ ...parsed, imageLocal })
            }
          } catch (e) {
            logLine('ERR', url, e.message || String(e))
            if (!isDryRun && IMPORT_MODE === 'db') {
              if (!prisma) prisma = new PrismaClient()
              await prisma.importLog.create({ data: { url, status: 'error', message: e.message?.slice(0, 500) || 'error' } })
            }
          }
        }))
      )
      await delay(300)
    }
  } else {
    const start = process.env.SUPPLIER_URL || `${BASE_URL}${URL_PREFIX}`
    const prods = await crawlForProducts(start)
    logLine(`Найдено товаров: ${prods.length}`)
    const limited = isDryRun && DRY_RUN_LIMIT > 0 ? prods.slice(0, DRY_RUN_LIMIT) : prods
    const limit = pLimit(CONCURRENCY)
    for (let i = 0; i < limited.length; i += BATCH_SIZE) {
      const batch = limited.slice(i, i + BATCH_SIZE)
      logLine(`Пакет ${i / BATCH_SIZE + 1}: ${batch.length} товаров`)
      await Promise.all(batch.map((parsed) => limit(async () => {
        try {
          const imageLocal = parsed.imageUrl ? await downloadAndOptimizeImage(parsed.imageUrl, parsed.slug) : null
          if (isDryRun) {
            logLine('DRY', JSON.stringify({
              supplier_url: parsed.supplierUrl,
              title: parsed.name,
              main_image_url: parsed.imageUrl,
              price_raw: parsed.priceRaw,
              parsed_price_kzt: parsed.price,
              category_slug: parsed.categorySlug,
              status: 'ok'
            }))
          } else {
            await upsertProduct({ ...parsed, imageLocal })
          }
        } catch (e) {
          logLine('ERR', parsed.supplierUrl, e.message || String(e))
        }
      })))
      await delay(300)
    }
  }

  if (prisma) await prisma.$disconnect()
  logLine('Импорт завершен')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
