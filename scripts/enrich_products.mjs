#!/usr/bin/env node
// Enrich local products.json by refetching source URLs and extracting clean, real characteristics and descriptions.
// - Cleans marketplace noise ("Найти похожие", store info, contact blocks)
// - Normalizes casing (turns ALL CAPS into Title Case except common abbreviations)
// - Keeps one image per product unchanged
// - Merges fields back into data/products.json atomically

import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'
import { load as cheerioLoad } from 'cheerio'
import pLimit from 'p-limit'

const BRAND_DOMAINS = {
  'pasabahce': ['pasabahce.com'],
  'luminarc': ['luminarc.com'],
  'arcopal': ['arcopal.com', 'luminarc.com'],
  'robert gordon': ['robertgordonaustralia.com'],
  'bormioli': ['bormiolirocco.com'],
  'libbey': ['libbey.com'],
  'arcoroc': ['arcdin.com', 'luminarc.com'],
  'dobrush': ['dfz.by', 'dobrush-porcelain.by'],
  'matfer': ['matfer.com'],
  'weck': ['weck-jars.com', 'weck.de'],
  'arcuisine': ['arcuisine.com', 'luminarc.com'],
  'rak porcelain': ['rakporcelain.com'],
  'churchill': ['churchill1795.com'],
  'steelite': ['steelite.com'],
  'spiegelau': ['spiegelau.com'],
  'zwiesel': ['zwiesel-glas.com'],
  'villeroy': ['villeroy-boch.com']
}

// Site-specific extraction profiles for manufacturer pages (best-effort)
const SITE_PROFILES = {
  'pasabahce.com': {
    descSelectors: ['.product-detail__description', '.desc', '.product-description'],
    tableSelector: 'table, .product-detail__table',
  },
  'luminarc.com': {
    descSelectors: ['.product-description', '.product__description', '.field--name-field-description'],
    tableSelector: 'table, .product-attributes, .field--name-field-technical-specifications',
  },
  'bormiolirocco.com': {
    descSelectors: ['.product-description', '.entry-content', '.woocommerce-product-details__short-description'],
    tableSelector: 'table, .shop_attributes',
  },
  'libbey.com': {
    descSelectors: ['.product-description', '.product-details__description', '[data-component="product-description"]'],
    tableSelector: 'table, .product-specs, .specifications',
  },
  'robertgordonaustralia.com': {
    descSelectors: ['.product-single__description', '.rte', '.prod__desc'],
    tableSelector: 'table, .product-specs, .prod__specs',
  },
  'dfz.by': {
    descSelectors: ['.product-description', '.content', '.node__content'],
    tableSelector: 'table, .specs, .characteristics',
  },
  'matfer.com': {
    descSelectors: ['.product-description', '.woocommerce-product-details__short-description', '.elementor-widget-theme-post-content'],
    tableSelector: 'table, .shop_attributes, .specifications',
  },
  'weck-jars.com': {
    descSelectors: ['.entry-content', '.product-description'],
    tableSelector: 'table',
  },
  'rakporcelain.com': {
    descSelectors: ['.product-description', '.description', '.content'],
    tableSelector: 'table, .specifications, .attributes'
  },
  'churchill1795.com': {
    descSelectors: ['.product-description', '.product-details', '.content'],
    tableSelector: 'table, .product-attributes, .specifications'
  },
  'steelite.com': {
    descSelectors: ['.product-content', '.product-description'],
    tableSelector: 'table, .product-specs, .specifications'
  },
  'spiegelau.com': {
    descSelectors: ['.product-description', '.text', '.content'],
    tableSelector: 'table, .product-attributes, .facts'
  },
  'zwiesel-glas.com': {
    descSelectors: ['.product-description', '.text', '.content'],
    tableSelector: 'table, .product-attributes, .facts'
  },
  'villeroy-boch.com': {
    descSelectors: ['.product-description', '.v-product__description', '.content'],
    tableSelector: 'table, .product-attributes, .v-attributes'
  }
}

function extractWithProfile($, host) {
  const profile = SITE_PROFILES[host]
  if (!profile) return { specs: extractSpecs($), desc: extractDescription($) }
  // Description
  let desc = ''
  for (const sel of profile.descSelectors || []) {
    const t = sanitizeValue($(sel).text())
    if (t && t.length > desc.length) desc = t
  }
  if (!desc) desc = extractDescription($)
  // Specs
  const specs = {}
  const tableSel = profile.tableSelector || 'table, dl'
  $(tableSel).each((_, cont) => {
    const $c = $(cont)
    $c.find('tr').each((__, tr) => {
      const tds = $(tr).find('td, th')
      if (tds.length >= 2) {
        const k = $(tds[0]).text()
        const v = $(tds[1]).text()
        const key = collapseWs(k)
        const val = sanitizeValue(v)
        if (key && val && key.length < 80 && val.length < 500) specs[key] = val
      }
    })
    $c.find('dt').each((__, dt) => {
      const k = $(dt).text()
      const v = $(dt).next('dd').text()
      const key = collapseWs(k)
      const val = sanitizeValue(v)
      if (key && val && key.length < 80 && val.length < 500) specs[key] = val
    })
  })
  // Fallback to generic parser if empty
  const finalSpecs = Object.keys(specs).length ? specs : extractSpecs($)
  return { specs: finalSpecs, desc }
}

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT = path.resolve(__dirname, '..')
const DATA_DIR = path.join(ROOT, 'data')
const PRODUCTS_JSON = path.join(DATA_DIR, 'products.json')
const LOG_DIR = path.join(ROOT, 'logs')
const RUN_LOG = path.join(LOG_DIR, 'enrich_run.txt')

const CONCURRENCY = 4
const HTTP_TIMEOUT_MS = 12000
const FETCH_DELAY_MS = 150

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

async function fetchText(url, { timeout = HTTP_TIMEOUT_MS } = {}) {
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), timeout)
  try {
    const resp = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36' } })
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
    return await resp.text()
  } finally {
    clearTimeout(id)
  }
}

function collapseWs(s) { return String(s || '').replace(/[\s\u00A0]+/g, ' ').trim() }
function splitSentences(text, max = 6) {
  const parts = collapseWs(text).split(/(?<=[.!?])\s+/).filter(Boolean)
  if (parts.length <= max) return parts.join(' ')
  return parts.slice(0, max).join(' ')
}
function titleCaseRu(s) { return collapseWs(s).split(' ').map(w => w ? (w[0].toUpperCase() + w.slice(1)) : '').join(' ') }
function normalizeCase(s) {
  const t = collapseWs(s)
  if (!t) return t
  const isAllCaps = /[A-ZА-ЯЁ]/.test(t) && t === t.toUpperCase()
  if (isAllCaps) {
    let out = titleCaseRu(t.toLowerCase())
    out = out.replace(/\bсвч\b/gi, 'СВЧ')
    out = out.replace(/\bпмм\b/gi, 'ПММ')
    return out
  }
  return t
}

const DROP_PATTERNS = [
  /Найти\s+похож[иы]е/gi,
  /Сообщить\s+о\s+неточности[\s\S]*/gi,
  /Магазин\s+и\s+адрес[\s\S]*/gi,
  /Режим\s+работы[\s\S]*/gi,
  /Телефон[\s\S]*/gi,
  /Доступность[\s\S]*/gi,
  /Склад[\s\S]*/gi,
  /Комплекс-?Бар[\s\S]*/gi,
  /Под\s+заказ[\s\S]*/gi,
  /По\s+вашему\s+запросу[\s\S]*/gi,
  /Двигайте\s+карту[\s\S]*/gi
]

function sanitizeValue(v) {
  let s = collapseWs(String(v ?? ''))
  if (!s) return ''
  for (const re of DROP_PATTERNS) s = s.replace(re, '')
  s = collapseWs(s)
  s = normalizeCase(s)
  return s
}

function extractSpecs($) {
  const specs = {}
  const add = (k, v) => {
    const key = collapseWs(k)
    let val = sanitizeValue(v)
    if (!key || !val) return
    if (key.length > 80 || val.length > 500) return
    // Skip obviously irrelevant keys from menus
    if (/^\s*(Бренды|Серии|Новинки|Ликвидация|Блог|Каталог по заведениям|Фуршетные линии|Технологическое оборудование|Вспомогательный инвентарь|Униформа|Хозяйственные товары)\s*$/i.test(key)) return
    specs[key] = val
  }
  $('table, dl').each((_, cont) => {
    const $c = $(cont)
    $c.find('tr').each((__, tr) => {
      const tds = $(tr).find('td, th')
      if (tds.length >= 2) add($(tds[0]).text(), $(tds[1]).text())
    })
    $c.find('dt').each((__, dt) => {
      const key = $(dt).text()
      const val = $(dt).next('dd').text()
      add(key, val)
    })
  })
  // generic feature blocks
  $('[class*="product-feature" i]').each((_, el) => {
    const $el = $(el)
    const key = $el.find('[class*="name" i]').first().text()
    const val = $el.find('[class*="value" i]').first().text()
    add(key, val)
  })
  return specs
}

function extractDescription($) {
  const candidates = [
    '#content_description',
    '[id*="описан" i]',
    '.ty-wysiwyg-content',
    '.product-description',
  ]
  let desc = ''
  for (const sel of candidates) {
    const t = sanitizeValue($(sel).text())
    if (t && t.length > desc.length) desc = t
  }
  if (!desc) {
    $('p').each((_, p) => {
      const t = sanitizeValue($(p).text())
      if (t.length > desc.length) desc = t
    })
  }
  return splitSentences(desc, 8)
}

async function loadProducts() {
  const raw = await fs.readFile(PRODUCTS_JSON, 'utf8')
  return JSON.parse(raw)
}

async function saveProductsAtomic(arr) {
  await fs.mkdir(path.dirname(PRODUCTS_JSON), { recursive: true })
  const tmp = PRODUCTS_JSON + '.tmp'
  await fs.writeFile(tmp, JSON.stringify(arr, null, 2), 'utf8')
  let delay = 100
  for (let i = 0; i < 20; i++) {
    try { await fs.rename(tmp, PRODUCTS_JSON); return } catch (e) {}
    await sleep(delay); delay = Math.min(delay * 2, 2000)
  }
  // last resort
  await fs.writeFile(PRODUCTS_JSON, JSON.stringify(arr, null, 2), 'utf8')
}

async function enrichOne(p) {
  const out = { ...p }
  if (!p.sourceUrl) return { out, updated: false, reason: 'no-source' }
  try {
    await sleep(FETCH_DELAY_MS)
    const html = await fetchText(p.sourceUrl)
    const $ = cheerioLoad(html)
    const newSpecs = extractSpecs($)
    const newDesc = extractDescription($)
    let updated = false
    if (Object.keys(newSpecs).length >= 2) { out.specs = newSpecs; updated = true }
    if (newDesc && newDesc.length > 20) { out.description = newDesc; updated = true }
    // If weak data, try manufacturer/provider search by brand+article or title
    const brand = (typeof p.brand === 'string' ? p.brand : p.brand?.name) || ''
    const article = (() => {
      const s = out.specs || {}
      const key = Object.keys(s).find(k => /артикул/i.test(k))
      return key ? String(s[key]) : ''
    })()
    const needMore = (!out.description || out.description.length < 60) || !out.specs || Object.keys(out.specs).length < 3
    const BING = process.env.BING_SEARCH_KEY
    if (needMore && BING && (brand || article)) {
      const domains = BRAND_DOMAINS[brand?.toLowerCase()] || []
      const terms = [brand, article, out.title || p.title || ''].filter(Boolean).join(' ')
      const queries = domains.length ? domains.map(d => `${terms} site:${d}`) : [terms]
      for (const q of queries) {
        try {
          const endpoint = `https://api.bing.microsoft.com/v7.0/search?q=${encodeURIComponent(q)}&count=5&mkt=ru-RU&safeSearch=Strict`
          const res = await fetch(endpoint, { headers: { 'Ocp-Apim-Subscription-Key': BING } })
          if (!res.ok) continue
          const data = await res.json()
          const webPages = data?.webPages?.value || []
          const hit = webPages.find(w => typeof w.url === 'string')
          if (!hit) continue
          await sleep(FETCH_DELAY_MS)
          const html2 = await fetchText(hit.url)
          const $2 = cheerioLoad(html2)
          let specs2, desc2
          try {
            const host = new URL(hit.url).hostname.replace(/^www\./, '')
            const out2 = extractWithProfile($2, host)
            specs2 = out2.specs
            desc2 = out2.desc
          } catch {
            specs2 = extractSpecs($2)
            desc2 = extractDescription($2)
          }
          if (Object.keys(specs2).length > (out.specs ? Object.keys(out.specs).length : 0)) { out.specs = specs2; updated = true }
          if (desc2 && (!out.description || desc2.length > out.description.length)) { out.description = desc2; updated = true }
          if (updated) break
        } catch {}
      }
    }
    return { out, updated }
  } catch (e) {
    return { out, updated: false, reason: e?.message || 'fetch-failed' }
  }
}

async function main() {
  await fs.mkdir(LOG_DIR, { recursive: true })
  const started = new Date()
  await fs.appendFile(RUN_LOG, `Start ${started.toISOString()}\n`, 'utf8')
  let updatedCount = 0, total = 0
  const arr = await loadProducts()
  const limit = pLimit(CONCURRENCY)
  const results = await Promise.all(arr.map((p, idx) => limit(async () => {
    total++
    const { out, updated, reason } = await enrichOne(p)
    if (updated) updatedCount++
    if (idx % 50 === 0) console.log(`[enrich] ${idx+1}/${arr.length}`)
    if (!updated && reason) await fs.appendFile(RUN_LOG, `[skip] ${p.slug} ${reason}\n`, 'utf8')
    return out
  })))
  await saveProductsAtomic(results)
  const ended = new Date()
  const summary = `Updated ${updatedCount} of ${total}; start=${started.toISOString()} end=${ended.toISOString()}`
  console.log(summary)
  await fs.appendFile(RUN_LOG, summary + '\n', 'utf8')
}

if (import.meta.url === pathToFileURL(__filename).href) {
  main().catch(err => { console.error('[enrich] Fatal:', err?.message || err); process.exit(1) })
}

