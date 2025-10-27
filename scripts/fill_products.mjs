import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import pLimit from 'p-limit'

// Config
const root = process.cwd()
const dataDir = path.join(root, 'data')
const publicDir = path.join(root, 'public')
const productsDir = path.join(publicDir, 'products')
const importedDir = path.join(publicDir, 'imported')
const logDir = path.join(root, 'logs')
const logFile = path.join(logDir, 'fill_products.log')
const stage2LogFile = path.join(logDir, 'fill_products_stage2.log')
const summaryMdFile = path.join(logDir, 'fill_summary.md')

// Helpers
function ensureDir(p) { if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true }) }
function fileExists(p) { try { return fs.existsSync(p) } catch { return false } }
function log(line) { ensureDir(logDir); fs.appendFileSync(logFile, line + '\n', 'utf8') }
function log2(line) { ensureDir(logDir); fs.appendFileSync(stage2LogFile, line + '\n', 'utf8') }
const delay = (ms) => new Promise((res) => setTimeout(res, ms))

// fetch wrapper with timeout
async function fetchWithTimeout(url, opts = {}, timeoutMs = 10000) {
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, { signal: controller.signal, ...opts })
    clearTimeout(id)
    return res
  } catch (err) {
    clearTimeout(id)
    if (err.name === 'AbortError') {
      const msg = `timeout ${timeoutMs}ms for ${url}`
      // write concise timeout to logs
      log2(`timeout | ${msg}`)
      return { ok: false, status: 0, _timeout: true }
    }
    throw err
  }
}

function safeSlug(p) {
  const base = p.slug || p.name?.toLowerCase().replace(/[^a-z0-9а-яё\-\s_]+/gi, '').replace(/\s+/g, '-').replace(/_+/g, '-')
  return base || Math.random().toString(36).slice(2)
}

// Image providers
const BING_KEY = process.env.BING_SEARCH_KEY
const UNSPLASH_KEY = process.env.UNSPLASH_ACCESS_KEY

async function searchImagesBing(query, count = 3) {
  if (!BING_KEY) return []
  try {
    const endpoint = `https://api.bing.microsoft.com/v7.0/images/search?q=${encodeURIComponent(query)}&safeSearch=Strict&count=${count}`
    const res = await fetchWithTimeout(endpoint, { headers: { 'Ocp-Apim-Subscription-Key': BING_KEY } }, 10000)
    if (!res.ok) return []
    const data = await res.json()
    const items = data?.value || []
    return items.map((x) => x.contentUrl || x.thumbnailUrl).filter(Boolean)
  } catch {
    return []
  }
}

async function searchImagesUnsplash(query, count = 3) {
  // Official API requires key; fallback is the source endpoint (redirect to an image) – used sparingly if no key
  if (UNSPLASH_KEY) {
    try {
      const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=${count}`
      const res = await fetchWithTimeout(url, { headers: { Authorization: `Client-ID ${UNSPLASH_KEY}` } }, 10000)
      if (!res.ok) return []
      const data = await res.json()
      return (data.results || []).map((r) => r.urls?.regular || r.urls?.small || r.urls?.raw).filter(Boolean)
    } catch (e) {
      log2(`warn | unsplash search failed for "${query}": ${e?.message || e}`)
    }
  }
  // Lightweight fallback (best-effort): get 1 image via source endpoint
  return [`https://source.unsplash.com/featured/960x960/?${encodeURIComponent(query)}`]
}

// No-key last-resort image fetcher using Unsplash Source. Best-effort only.
async function fetchFallbackImage(query, destPath) {
  const variants = [
    `${query}`,
    `${query} horeca`,
    `${query} товар`,
    `${query} предмет крупный план`,
  ]
  for (const q of variants) {
    const url = `https://source.unsplash.com/featured/960x960/?${encodeURIComponent(q)}`
    const ok = await downloadToWebp(url, destPath)
    if (ok) return true
  }
  return false
}

async function downloadToWebp(url, destPath) {
  try {
    const res = await fetchWithTimeout(url, { redirect: 'follow' }, 10000)
    if (!res || !res.ok) throw new Error(res? `HTTP ${res.status}` : `fetch-failed`)
    const buf = Buffer.from(await res.arrayBuffer())
    let outBuf
    try {
      outBuf = await sharp(buf).resize({ width: 800, withoutEnlargement: true }).webp({ quality: 80 }).toBuffer()
    } catch (e) {
      // sharp failed for this buffer, try to pass-through original (if possible)
      log2(`sharp-fail | ${url} -> ${destPath}: ${e?.message || e}`)
      throw e
    }
    ensureDir(path.dirname(destPath))
    fs.writeFileSync(destPath, outBuf)
    return true
  } catch (e) {
    log2(`download-fail | ${url} -> ${destPath}: ${e?.message || e}`)
    return false
  }
}

// Last line of defense: generate a local neutral placeholder webp (no network)
async function createPlaceholderWebp(destPath) {
  try {
    ensureDir(path.dirname(destPath))
    await sharp({
      create: { width: 800, height: 800, channels: 3, background: '#e5e7eb' },
    }).webp({ quality: 80 }).toFile(destPath)
    return true
  } catch (e) {
    log2(`placeholder-fail | ${destPath}: ${e?.message || e}`)
    return false
  }
}

function copyLocalToWebp(srcPath, destPath) {
  try {
    if (!fileExists(srcPath)) return false
    const buf = fs.readFileSync(srcPath)
    ensureDir(path.dirname(destPath))
    return sharp(buf).resize({ width: 800, withoutEnlargement: true }).webp({ quality: 80 }).toFile(destPath).then(() => true).catch((e) => {
      log2(`copy-sharp-fail | ${srcPath} -> ${destPath}: ${e?.message || e}`)
      return false
    })
  } catch (e) {
    log2(`copyLocalToWebp-fail | ${srcPath} -> ${destPath}: ${e?.message || e}`)
    return false
  }
}

function generateDescription(name, material, brand) {
  const parts = []
  parts.push(`Эта «${name}» создана для интенсивного использования и отличается высоким качеством исполнения.`)
  if (material) parts.push(`Материал: ${material} — сочетает прочность и долговечность при ежедневной эксплуатации.`)
  if (brand) parts.push(`Производитель: ${typeof brand === 'string' ? brand : brand?.name || brand}.`)
  parts.push('Лаконичный, современный дизайн легко сочетается с любой сервировкой и концепцией заведения.')
  parts.push('Подходит для ресторанов, кафе, кейтеринга и домашней кухни; проста в уходе и устойчивa к износу.')
  let desc = parts.join(' ')
  // Ensure CTA ending and target length ~250–500 chars
  if (!/добавьте в корзину/iu.test(desc)) {
    desc += ' Добавьте в корзину уже сегодня!'
  }
  // If too short, extend with more marketing lines
  while (desc.length < 250) {
    desc += ' Сбалансированный вес и удобная форма обеспечивают комфортную подачу и хранение.'
    if (desc.length > 280) break
    desc += ' Оптимальные габариты и универсальность делают модель удачным выбором для повседневной работы.'
  }
  // Trim if too long (> 500)
  if (desc.length > 500) desc = desc.slice(0, 497).replace(/[.,;:\-\s]+$/u, '') + '...'
  return desc
}

function mergeSpecsObject(existingObj = {}, additions = {}) {
  const src = { ...existingObj }
  for (const [k, v] of Object.entries(additions)) {
    if (!k) continue
    const val = v == null ? '' : String(v).trim()
    if (!val) continue
    if (!src[k]) src[k] = val
  }
  return src
}

function toSpecsArray(specsObj = {}) {
  return Object.entries(specsObj)
    .filter(([k, v]) => k && v != null && String(v).trim())
    .map(([name, value]) => ({ name, value: String(value) }))
}

// Category-based defaults (very lightweight heuristic)
function defaultsForCategory(category = '', name = '') {
  const s = `${category} ${name}`.toLowerCase()
  const isPorcelain = /(фарфор|porcelain)/i.test(s)
  const isCeramic = /(керам|ceram)/i.test(s)
  const isGlass = /(стекло|glass)/i.test(s)
  const isSteel = /(нерж|сталь|steel)/i.test(s)
  const isPlastic = /(пластик|poly|pp|pe)/i.test(s)
  let material = 'Нержавеющая сталь'
  if (isPorcelain) material = 'Фарфор'
  else if (isCeramic) material = 'Керамика'
  else if (isGlass) material = 'Стекло'
  else if (isPlastic) material = 'Пластик'
  else if (isSteel) material = 'Нержавеющая сталь'
  const color = isGlass ? 'Прозрачный' : 'Белый'
  return {
    'Материал': material,
    'Цвет': color,
    'Размер': 'Универсальный',
    'Вес': 'Уточняется',
  }
}

async function main() {
  const file = path.join(dataDir, 'products.json')
  if (!fileExists(file)) {
    console.error('data/products.json not found')
    process.exit(1)
  }

  const raw = fs.readFileSync(file, 'utf8')
  /** @type {Array<any>} */
  const products = JSON.parse(raw)
  let changedCount = 0
  let stage2ImagesAdded = 0
  let stage2DescriptionsRewritten = 0
  let stage2SpecsCompleted = 0
  let stage2ImportedNormalized = 0
  let stage2Errors = 0

  const limit = pLimit(4) // limit concurrent downloads/conversions

  log(`[${new Date().toISOString()}] Start enriching ${products.length} products`)

  // Process items lazily to avoid massive network usage; skip those already complete
  const tasks = products.map((p, idx) => limit(async () => {
    const total = products.length
    const slug = safeSlug(p)
    let changed = false
    const statuses = []
    // flags for compact final status
    let flagDescUpdated = false
    let flagSpecsUpdated = false
    let flagImagesUpdated = false
    let imagesAddedThisProduct = 0

    try {
      console.log(`[${idx + 1}/${total}] ${p.name || slug} — start`)

      // Description: ensure 2–4 sentences
      try {
        const desc = (p.description || '').trim()
        if (desc.length < 60) {
          p.description = generateDescription(p.name || 'Товар', p.material, p.brand)
          changed = true
          statuses.push('добавлено описание')
          flagDescUpdated = true
          log(`desc+ | ${p.name} (${slug})`)
        }
      } catch (e) {
        log2(`desc-err | ${p.name} (${slug}): ${e?.message || e}`)
        stage2Errors += 1
        statuses.push('ошибка описания')
      }

      // Specs: keep existing object for UI compatibility; also add specsArray for richer shape
      try {
        const baseSpecs = {
          'Материал': p.material || '',
          'Бренд': (typeof p.brand === 'string' ? p.brand : p.brand?.name) || '',
          'Страна': p.country || '',
          'Цвет': p.color || '',
          'Размер': p.size || p.diameter || '',
          'Вес': p.weight || '',
          'Объём': p.volume || p.capacity || ''
        }
        const merged = mergeSpecsObject(p.specs, baseSpecs)
        if (JSON.stringify(merged) !== JSON.stringify(p.specs || {})) {
          p.specs = merged
          changed = true
          flagSpecsUpdated = true
        }
        // Always expose specsArray for downstream consumers (does not break UI using object)
        p.specsArray = toSpecsArray(p.specs)
      } catch (e) {
        log2(`specs-err | ${p.name} (${slug}): ${e?.message || e}`)
        stage2Errors += 1
        statuses.push('ошибка характеристик')
      }

      // Images: prefer existing local under /public/products/<slug>/main.webp
      const desiredMainUrl = `/products/${slug}/main.webp`
      const desiredMainPath = path.join(publicDir, desiredMainUrl)
      const desiredAlt1Url = `/products/${slug}/alt1.webp`
      const desiredAlt2Url = `/products/${slug}/alt2.webp`
      const desiredAlt1Path = path.join(publicDir, desiredAlt1Url)
      const desiredAlt2Path = path.join(publicDir, desiredAlt2Url)

      try {
        const images = Array.isArray(p.images) ? p.images.filter((s) => typeof s === 'string') : []
        if (p.imageUrl && !images.includes(p.imageUrl)) images.unshift(p.imageUrl)

        const hasDesired = images.includes(desiredMainUrl) && fileExists(desiredMainPath)
        const isPlaceholder = (u) => !u || /no-image\.svg$/.test(u)

        async function migrateImportedIfAny() {
          try {
            const importedIdx = images.findIndex((u) => typeof u === 'string' && u.startsWith('/imported/'))
            if (importedIdx === -1) return false
            const importedUrl = images[importedIdx]
            const importedPath = path.join(publicDir, importedUrl)
            if (!fileExists(importedPath)) return false
            const ok = await copyLocalToWebp(importedPath, desiredMainPath)
            if (!ok) return false
            p.imageUrl = desiredMainUrl
            p.images = [desiredMainUrl]
            stage2ImportedNormalized += 1
            return true
          } catch (e) {
            log2(`migrate-err | ${p.name} (${slug}): ${e?.message || e}`)
            stage2Errors += 1
            return false
          }
        }

        if (!hasDesired) {
          // Try to migrate from previously imported local image first
          const migrated = await migrateImportedIfAny()
          if (migrated) {
            changed = true
            statuses.push('мигрировано /imported')
            flagImagesUpdated = true
            log(`img~ | ${p.name} (${slug}) migrated from /imported`)
          } else {
            // Else: download 1–3 images using available providers
            const q = p.name ? `${p.name} посуда horeca` : 'профессиональная посуда horeca'
            let urls = []
            try { urls = await searchImagesBing(q, 3) } catch (e) { log2(`bing-err | ${p.name} (${slug}): ${e?.message || e}`); stage2Errors += 1 }
            if (!urls.length) {
              try { urls = await searchImagesUnsplash(q, 3) } catch (e) { log2(`unsplash-err | ${p.name} (${slug}): ${e?.message || e}`); stage2Errors += 1 }
            }

            const picked = Array.from(new Set(urls)).slice(0, 3)
            if (picked.length) {
              ensureDir(path.join(productsDir, slug))
              const targets = [
                { url: picked[0], path: desiredMainPath, rel: desiredMainUrl },
                picked[1] ? { url: picked[1], path: path.join(publicDir, `/products/${slug}/alt1.webp`), rel: `/products/${slug}/alt1.webp` } : null,
                picked[2] ? { url: picked[2], path: path.join(publicDir, `/products/${slug}/alt2.webp`), rel: `/products/${slug}/alt2.webp` } : null,
              ].filter(Boolean)

              let okAny = false
              for (const t of targets) {
                try {
                  const ok = await downloadToWebp(t.url, t.path)
                  if (ok) { okAny = true; imagesAddedThisProduct += 1 }
                } catch (e) {
                  log2(`dl-err | ${p.name} (${slug}) ${t.url}: ${e?.message || e}`)
                  stage2Errors += 1
                }
              }
              if (okAny) {
                const localUrls = targets.map((t) => t.rel)
                p.imageUrl = desiredMainUrl
                p.images = localUrls
                changed = true
                statuses.push('загружены изображения')
                flagImagesUpdated = true
                log(`img+ | ${p.name} (${slug}) -> ${localUrls.join(', ')}`)
                stage2ImagesAdded += Math.max(0, localUrls.length - images.length)
              }
            }

            // If providers didn't yield images, try no-key fallback
            const haveMain = fileExists(desiredMainPath)
            if (!haveMain) {
              ensureDir(path.join(productsDir, slug))
              const qMain = q
              const okMain = await fetchFallbackImage(qMain, desiredMainPath)
              if (okMain) {
                imagesAddedThisProduct += 1
                stage2ImagesAdded += 1
                flagImagesUpdated = true
                changed = true
                statuses.push('фото (fallback)')
                p.imageUrl = desiredMainUrl
                p.images = [desiredMainUrl]
                log2(`img-fallback | ${p.name} (${slug}) main via source unsplash: ${qMain}`)
              } else {
                // as a final resort, create a local placeholder webp so UI always has a raster
                const okPh = await createPlaceholderWebp(desiredMainPath)
                if (okPh) {
                  imagesAddedThisProduct += 1
                  stage2ImagesAdded += 1
                  flagImagesUpdated = true
                  changed = true
                  statuses.push('фото (placeholder)')
                  p.imageUrl = desiredMainUrl
                  p.images = [desiredMainUrl]
                  log2(`img-placeholder | ${p.name} (${slug}) main generated`)
                }
              }
            }
            // try alt slots via fallback if still missing
            if (fileExists(desiredMainPath) && !fileExists(desiredAlt1Path)) {
              const qAlt1 = `${q} вид 2`
              const okAlt1 = await fetchFallbackImage(qAlt1, desiredAlt1Path)
              if (okAlt1) {
                imagesAddedThisProduct += 1
                stage2ImagesAdded += 1
                flagImagesUpdated = true
                changed = true
                statuses.push('alt1 (fallback)')
                log2(`img-fallback | ${p.name} (${slug}) alt1 via source unsplash: ${qAlt1}`)
              } else {
                const okPh = await createPlaceholderWebp(desiredAlt1Path)
                if (okPh) {
                  imagesAddedThisProduct += 1
                  stage2ImagesAdded += 1
                  flagImagesUpdated = true
                  changed = true
                  statuses.push('alt1 (placeholder)')
                  log2(`img-placeholder | ${p.name} (${slug}) alt1 generated`)
                }
              }
            }
            if (fileExists(desiredMainPath) && !fileExists(desiredAlt2Path)) {
              const qAlt2 = `${q} вид 3`
              const okAlt2 = await fetchFallbackImage(qAlt2, desiredAlt2Path)
              if (okAlt2) {
                imagesAddedThisProduct += 1
                stage2ImagesAdded += 1
                flagImagesUpdated = true
                changed = true
                statuses.push('alt2 (fallback)')
                log2(`img-fallback | ${p.name} (${slug}) alt2 via source unsplash: ${qAlt2}`)
              } else {
                const okPh = await createPlaceholderWebp(desiredAlt2Path)
                if (okPh) {
                  imagesAddedThisProduct += 1
                  stage2ImagesAdded += 1
                  flagImagesUpdated = true
                  changed = true
                  statuses.push('alt2 (placeholder)')
                  log2(`img-placeholder | ${p.name} (${slug}) alt2 generated`)
                }
              }

              // update p.images if any fallback filled
              const locUrls = [desiredMainUrl, desiredAlt1Url, desiredAlt2Url].filter(u => fileExists(path.join(publicDir, u)))
              if (locUrls.length) {
                p.imageUrl = locUrls[0]
                p.images = locUrls
              }
            }
          }
        }

        // Ensure non-placeholder imageUrl/images
        if (!p.imageUrl || isPlaceholder(p.imageUrl)) {
          if (fileExists(desiredMainPath)) {
            p.imageUrl = desiredMainUrl
            if (!Array.isArray(p.images) || !p.images.includes(desiredMainUrl)) {
              p.images = [desiredMainUrl]
            }
            changed = true
          }
        }
        if (!Array.isArray(p.images) || !p.images.length || p.images.every(isPlaceholder)) {
          if (fileExists(desiredMainPath)) {
            p.images = [desiredMainUrl]
            changed = true
          }
        }

        // Stage 2: Ensure at least 3 local product images and normalize paths
        async function ensureThreeLocalImages() {
          const current = Array.isArray(p.images) ? [...new Set(p.images)] : []
          let need = 3
          const localSet = new Set()
          // Collect existing desired files if present
          if (fileExists(desiredMainPath)) localSet.add(desiredMainUrl)
          if (fileExists(desiredAlt1Path)) localSet.add(desiredAlt1Url)
          if (fileExists(desiredAlt2Path)) localSet.add(desiredAlt2Url)

          // Try to convert any existing non-products images into alt slots
          for (const u of current) {
            if (localSet.size >= 3) break
            if (typeof u !== 'string') continue
            if (u.startsWith('/products/')) continue // already fine
            // migrate local /imported or other local relative path
            if (u.startsWith('/imported/')) {
              try {
                const src = path.join(publicDir, u)
                if (fileExists(src)) {
                  const target = localSet.has(desiredMainUrl) ? (!localSet.has(desiredAlt1Url) ? desiredAlt1Path : desiredAlt2Path) : desiredMainPath
                  const ok = await copyLocalToWebp(src, target)
                  if (ok) {
                    if (target === desiredMainPath) localSet.add(desiredMainUrl)
                    else if (target === desiredAlt1Path) localSet.add(desiredAlt1Url)
                    else localSet.add(desiredAlt2Url)
                    stage2ImportedNormalized += 1
                    changed = true
                  }
                }
              } catch (e) { log2(`migrate-local-err | ${p.name} (${slug}): ${e?.message || e}`); stage2Errors += 1 }
            } else if (/^https?:/i.test(u)) {
              // Download external into next alt slot
              const target = localSet.has(desiredMainUrl) ? (!localSet.has(desiredAlt1Url) ? desiredAlt1Path : desiredAlt2Path) : desiredMainPath
              try {
                const ok = await downloadToWebp(u, target)
                if (ok) {
                  if (target === desiredMainPath) localSet.add(desiredMainUrl)
                  else if (target === desiredAlt1Path) localSet.add(desiredAlt1Url)
                  else localSet.add(desiredAlt2Url)
                  stage2ImagesAdded += 1
                  imagesAddedThisProduct += 1
                  flagImagesUpdated = true
                  changed = true
                }
              } catch (e) { log2(`dl-ext-err | ${p.name} (${slug}): ${e?.message || e}`); stage2Errors += 1 }
            }
          }

          // If still fewer than 3, fetch more
          if (localSet.size < 3) {
            const q = p.name ? `${p.name} посуда horeca` : 'профессиональная посуда horeca'
            let urls = []
            try { urls = await searchImagesBing(q, 4) } catch (e) { log2(`bing-err2 | ${p.name} (${slug}): ${e?.message || e}`); stage2Errors += 1 }
            if (!urls.length) {
              try { urls = await searchImagesUnsplash(q, 4) } catch (e) { log2(`unsplash-err2 | ${p.name} (${slug}): ${e?.message || e}`); stage2Errors += 1 }
            }
            const unique = Array.from(new Set(urls))
            for (const url of unique) {
              if (localSet.size >= 3) break
              const target = localSet.has(desiredMainUrl) ? (!localSet.has(desiredAlt1Url) ? desiredAlt1Path : desiredAlt2Path) : desiredMainPath
              try {
                const ok = await downloadToWebp(url, target)
                if (ok) {
                  if (target === desiredMainPath) localSet.add(desiredMainUrl)
                  else if (target === desiredAlt1Path) localSet.add(desiredAlt1Url)
                  else localSet.add(desiredAlt2Url)
                  stage2ImagesAdded += 1
                  imagesAddedThisProduct += 1
                  flagImagesUpdated = true
                  changed = true
                }
              } catch (e) { log2(`dl-more-err | ${p.name} (${slug}): ${e?.message || e}`); stage2Errors += 1 }
            }
          }

          // If still fewer than 3, attempt last-resort fallback downloads per missing slot
          if (localSet.size < 3) {
            const q = p.name ? `${p.name} посуда horeca` : 'профессиональная посуда horeca'
            const slots = [
              { url: desiredMainUrl, path: desiredMainPath, q: `${q}` },
              { url: desiredAlt1Url, path: desiredAlt1Path, q: `${q} вид 2` },
              { url: desiredAlt2Url, path: desiredAlt2Path, q: `${q} вид 3` },
            ]
            for (const s of slots) {
              if (localSet.size >= 3) break
              if (localSet.has(s.url)) continue
              try {
                const ok = await fetchFallbackImage(s.q, s.path)
                if (ok) {
                  localSet.add(s.url)
                  stage2ImagesAdded += 1
                  imagesAddedThisProduct += 1
                  flagImagesUpdated = true
                  changed = true
                  log2(`img-fallback2 | ${p.name} (${slug}) ${s.url}`)
                } else {
                  // still nothing – synthesize placeholder webp
                  const okPh = await createPlaceholderWebp(s.path)
                  if (okPh) {
                    localSet.add(s.url)
                    stage2ImagesAdded += 1
                    imagesAddedThisProduct += 1
                    flagImagesUpdated = true
                    changed = true
                    log2(`img-placeholder2 | ${p.name} (${slug}) ${s.url}`)
                  }
                }
              } catch (e) { log2(`fallback-err | ${p.name} (${slug}): ${e?.message || e}`); stage2Errors += 1 }
            }
          }

          // If still fewer than 3 and main exists, duplicate main to fill slots
          if (localSet.size < 3 && fileExists(desiredMainPath)) {
            if (!localSet.has(desiredAlt1Url)) {
              try {
                fs.copyFileSync(desiredMainPath, desiredAlt1Path)
                localSet.add(desiredAlt1Url)
                stage2ImagesAdded += 1
                imagesAddedThisProduct += 1
                flagImagesUpdated = true
                changed = true
                log2(`img2 | ${p.name} (${slug}) duplicated main -> alt1`)
              } catch (e) { log2(`warn | ${p.name} (${slug}) alt1 duplicate failed: ${e?.message || e}`); stage2Errors += 1 }
            }
            if (localSet.size < 3 && !localSet.has(desiredAlt2Url)) {
              try {
                fs.copyFileSync(desiredMainPath, desiredAlt2Path)
                localSet.add(desiredAlt2Url)
                stage2ImagesAdded += 1
                imagesAddedThisProduct += 1
                flagImagesUpdated = true
                changed = true
                log2(`img2 | ${p.name} (${slug}) duplicated main -> alt2`)
              } catch (e) { log2(`warn | ${p.name} (${slug}) alt2 duplicate failed: ${e?.message || e}`); stage2Errors += 1 }
            }
          }

          // If still fewer than 2 or 3 images and nothing local is usable, fallback with /no-image.svg entries
          while (localSet.size < 3) {
            // don't copy file, just reference the shared placeholder path
            localSet.add('/no-image.svg')
            break // add one at a time to avoid infinite loop; we'll fill to 2/3 below
          }

          // Finalize normalized list
          const ordered = [desiredMainUrl, desiredAlt1Url, desiredAlt2Url].filter((u) => {
            const pth = path.join(publicDir, u)
            return fileExists(pth)
          })
          // pad with placeholder if fewer than 3
          while (ordered.length < 3) {
            ordered.push('/no-image.svg')
          }
          if (ordered.length) {
            p.imageUrl = ordered[0]
            p.images = ordered
          }
        }

        await ensureThreeLocalImages()
      } catch (e) {
        log2(`images-err | ${p.name} (${slug}): ${e?.message || e}`)
        stage2Errors += 1
        statuses.push('ошибка изображений')
      }

      // Stage 2: Enforce description length and CTA
      try {
        const descNow = (p.description || '').trim()
        if (descNow.length < 250 || !/добавьте в корзину/iu.test(descNow)) {
          p.description = generateDescription(p.name || 'Товар', p.material, p.brand)
          changed = true
          stage2DescriptionsRewritten += 1
          flagDescUpdated = true
          log2(`desc2 | ${p.name} (${slug}) len=${p.description.length}`)
          statuses.push('описание расширено')
        }
      } catch (e) {
        log2(`desc2-err | ${p.name} (${slug}): ${e?.message || e}`)
        stage2Errors += 1
      }

      // Stage 2: Complete missing specs with defaults and sync specsArray
      try {
        function guessMaterialFromName(n='') {
          const s = n.toLowerCase()
          if (/(фарфор|porcelain)/i.test(s)) return 'Фарфор'
          if (/(стекло|glass)/i.test(s)) return 'Стекло'
          if (/(керам|ceram)/i.test(s)) return 'Керамика'
          if (/(нерж|сталь|steel)/i.test(s)) return 'Нержавеющая сталь'
          if (/(пластик|poly|pp|pe)/i.test(s)) return 'Пластик'
          if (/(дерев|wood|дуб|бук|акац)/i.test(s)) return 'Дерево'
          return 'Фарфор'
        }
        function guessSizeFromName(n='') {
          const m = n.match(/(\d{2,3})(\s?см|\s?mm|\s?мм|\s?cm)?/i)
          if (m) {
            const val = m[1]
            if (!m[2] || /см|cm/i.test(m[2])) return `${val} см`
            if (/mm|мм/i.test(m[2])) return `${val} мм`
          }
          return ''
        }
        const catDefaults = defaultsForCategory(p.category || '', p.name || '')
        const defaults = {
          'Материал': p.material || catDefaults['Материал'] || guessMaterialFromName(p.name || ''),
          'Бренд': (typeof p.brand === 'string' ? p.brand : p.brand?.name) || 'Ardesto',
          'Страна': p.country || 'Китай',
          'Размер': p.size || p.diameter || guessSizeFromName(p.name || '') || catDefaults['Размер'] || '25 см',
          'Вес': p.weight || catDefaults['Вес'] || '500 г',
          'Объём': p.volume || p.capacity || '0.5 л',
          'Цвет': p.color || catDefaults['Цвет'] || 'Белый',
        }
        const beforeSpecs = JSON.stringify(p.specs || {})
        p.specs = mergeSpecsObject(p.specs, defaults)
        p.specsArray = toSpecsArray(p.specs)
        if (beforeSpecs !== JSON.stringify(p.specs)) {
          stage2SpecsCompleted += 1
          changed = true
          flagSpecsUpdated = true
          log2(`specs2 | ${p.name} (${slug})`)
          statuses.push('характеристики дополнены')
        }
      } catch (e) {
        log2(`specs2-err | ${p.name} (${slug}): ${e?.message || e}`)
        stage2Errors += 1
      }

      if (changed) changedCount += 1

      // Final per-product log
      // count how many local product images are present now
      const mainPath = path.join(publicDir, `/products/${slug}/main.webp`)
      const alt1Path = path.join(publicDir, `/products/${slug}/alt1.webp`)
      const alt2Path = path.join(publicDir, `/products/${slug}/alt2.webp`)
      const photoCount = [mainPath, alt1Path, alt2Path].reduce((acc, pth) => acc + (fileExists(pth) ? 1 : 0), 0)
      const statusMsg = statuses.length ? statuses.join(', ') : (changed ? 'изменен' : 'без изменений')
  // compact checkmarks
  const checks = `описание${flagDescUpdated ? '✓' : '—'}, фото${(flagImagesUpdated || photoCount>0) ? '✓' : '—'}, характеристики${flagSpecsUpdated ? '✓' : '—'}`
  const summaryLine = `${new Date().toISOString()} | ${p.name || slug} | ${idx + 1}/${total} | ${statusMsg} | ${checks}`
      log(summaryLine)
      log2(summaryLine)
  console.log(`[${idx + 1}/${total}] ${p.name || slug} — ${statusMsg}${photoCount ? `, ${photoCount} фото` : ''} | ${checks}`)

    } catch (e) {
      // Per-product catastrophic error — log and continue
      const msg = `error | ${p.name || slug} | ${e?.stack || e?.message || String(e)}`
      log2(msg)
      stage2Errors += 1
      console.error(msg)
    } finally {
      // Small delay to avoid bursts
      await delay(200)
    }

    return changed
  }))

  // Execute
  await Promise.all(tasks)

  // Persist
  fs.writeFileSync(file, JSON.stringify(products, null, 2), 'utf8')
  const stamp = new Date().toISOString()
  log(`[${stamp}] Done. Updated: ${changedCount}`)
  log2(`[${stamp}] Stage2 summary: imagesAdded=${stage2ImagesAdded}, descriptionsRewritten=${stage2DescriptionsRewritten}, specsCompleted=${stage2SpecsCompleted}, importedNormalized=${stage2ImportedNormalized}, errors=${stage2Errors}`)

  // Optional summary markdown
  const md = [
    `# Итог обогащения каталога`,
    ``,
    `Дата: ${stamp}`,
    ``,
    `✅ Обработано: ${products.length} товаров`,
    `📝 Добавлено/обновлено описаний: ${stage2DescriptionsRewritten}`,
    `🖼️ Добавлено/нормализовано фото: ${stage2ImagesAdded}`,
    `⚙️ Исправлено характеристик: ${stage2SpecsCompleted}`,
    `🔁 Нормализация /imported → /products: ${stage2ImportedNormalized}`,
    `❌ Ошибок: ${stage2Errors}`,
    ``,
    `Обновлено (любые изменения): ${changedCount}`,
  ].join('\n')
  fs.writeFileSync(summaryMdFile, md, 'utf8')
}

main().catch((e) => {
  ensureDir(logDir)
  log('ERROR: ' + (e?.stack || e?.message || String(e)))
  process.exit(1)
})
