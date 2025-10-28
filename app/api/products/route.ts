import { NextResponse } from 'next/server'
import fs from 'node:fs'
import path from 'node:path'
import { markStart, logIfSlow } from '../../../lib/timing'

// Ensure this handler is always dynamic; avoid static optimization touching DB during build
export const dynamic = 'force-dynamic'

// Simple in-memory cache with TTL to avoid repeated FS/DB work in file-DB mode
type CacheEntry = { ts: number; data: any }
const CACHE_TTL_MS = 30_000
const cache = new Map<string, CacheEntry>()

function getFromCache(key: string) {
  const c = cache.get(key)
  if (!c) return null
  if (Date.now() - c.ts > CACHE_TTL_MS) {
    cache.delete(key)
    return null
  }
  return c.data
}
function setCache(key: string, data: any) {
  cache.set(key, { ts: Date.now(), data })
}

export async function GET(req: Request) {
  const start = markStart()
  const { searchParams } = new URL(req.url)
  const page = Number(searchParams.get('page') || '1')
  const pageSize = Number(searchParams.get('pageSize') || '24')
  const sort = searchParams.get('sort') || 'popular'
  const inStock = searchParams.get('inStock')
  const category = searchParams.get('category')
  const subcategory = searchParams.get('subcategory')
  const material = searchParams.get('material')
  const brand = searchParams.get('brand')
  const color = searchParams.get('color')
  const q = (searchParams.get('q') || '').trim()
  const priceMin = Number(searchParams.get('priceMin') || '0')
  const priceMax = Number(searchParams.get('priceMax') || '0')

  const where: any = {}
  if (inStock === 'true') where.inventory = { some: { quantity: { gt: 0 } } }
  if (category) where.categories = { some: { slug: category } }
  if (material) where.material = { equals: material, mode: 'insensitive' as any }
  if (color) where.color = { equals: color, mode: 'insensitive' as any }
  if (q) where.OR = [
    { name: { contains: q, mode: 'insensitive' } },
    { description: { contains: q, mode: 'insensitive' } }
  ]
  if (priceMin || priceMax) where.prices = { some: { amount: { gte: priceMin || undefined, lte: priceMax || undefined } } }

  let orderBy: any = { popularity: 'desc' }
  if (sort === 'new') orderBy = { createdAt: 'desc' }
  if (sort === 'price_asc') orderBy = { prices: { _min: { amount: 'asc' } } }
  if (sort === 'price_desc') orderBy = { prices: { _max: { amount: 'desc' } } }
  if (sort === 'material_asc') orderBy = { material: 'asc' }
  if (sort === 'color_asc') orderBy = { color: 'asc' }

  const useFile = (process.env.USE_FILE_DB || 'false').toLowerCase() === 'true'

  // Cache key per URL params
  const key = 'products:' + searchParams.toString()
  const cached = getFromCache(key)
  if (cached) {
    return NextResponse.json(cached, { headers: { 'Cache-Control': 'max-age=30, s-maxage=60, stale-while-revalidate=300' } })
  }
  if (!useFile) {
    try {
      // Lazy import prisma only when DB mode is actually used
      const { prisma } = await import('../../../server/prisma')
      const [total, items] = await Promise.all([
        prisma.product.count({ where }),
        prisma.product.findMany({
          where,
          orderBy,
          skip: (page - 1) * pageSize,
          take: pageSize,
          include: {
            brand: true,
            prices: { orderBy: { createdAt: 'desc' }, take: 1 },
            media: { take: 1 }
          }
        })
      ])
  const shaped = items.map((p: any) => ({
        id: p.id,
        slug: p.slug,
        name: p.name,
        brand: p.brand?.name || null,
        price: p.prices[0]?.amount || null,
        imageUrl: p.media[0]?.url || null
      }))
      const payload = { total, page, pageSize, items: shaped }
      setCache(key, payload)
  const resp = NextResponse.json(payload, { headers: { 'Cache-Control': 'max-age=30, s-maxage=60, stale-while-revalidate=300' } })
  logIfSlow('api/products:db', start, 500, { q: Object.fromEntries(searchParams.entries()) })
  return resp
    } catch (e) {
      // fallback to file DB
    }
  }

  // File DB fallback
  try {
    const file = path.join(process.cwd(), 'data', 'products.json')
    const arr: any[] = JSON.parse(fs.readFileSync(file, 'utf8'))
    let filtered = arr.slice()
    const normalize = (s: string) => (s||'').toString().trim().toLowerCase()
    const toNumber = (s: string) => Number(String(s).replace(',', '.').replace(/[^0-9.]/g, ''))
    const normDim = (val: string): string => {
      const v = String(val || '').trim()
      if (!v) return ''
      const m = v.match(/([0-9]+[\.,]?[0-9]*)\s*(мм|cm|см|mm)?/i)
      if (m) {
        const num = toNumber(m[1])
        const unit = (m[2] || 'мм').toLowerCase()
        if (unit === 'см' || unit === 'cm') return Math.round(num * 10) + ' мм'
        return Math.round(num) + ' мм'
      }
      return v
    }
    const normVol = (val: string): string => {
      const v = String(val || '').trim()
      if (!v) return ''
      const m = v.match(/([0-9]+[\.,]?[0-9]*)\s*(мл|ml|л|l)?/i)
      if (m) {
        const num = toNumber(m[1])
        const unit = (m[2] || 'мл').toLowerCase()
        if (unit === 'л' || unit === 'l') return Math.round(num * 1000) + ' мл'
        return Math.round(num) + ' мл'
      }
      return v
    }
    const mapMaterial = (v: string) => {
      const s = (v || '').toString().trim().toLowerCase()
      if (!s) return ''
      // Ceramics & porcelain family
      if (/(костян|bone\s*china)/i.test(s)) return 'костяной фарфор'
      if (/(фарфор|porcelain)/i.test(s)) return 'фарфор'
      if (/(фаянс|earthenware)/i.test(s)) return 'фаянс'
      if (/(stone\s*ware|каменн|керамик(а)?\s*камен|грс|грэс)/i.test(s)) return 'каменная керамика'
      if (/(керамик|ceramic)/i.test(s)) return 'керамика'
      // Glass types
      if (/(боросил|borosilicate)/i.test(s)) return 'боросиликатное стекло'
      if (/(закален|tempered)/i.test(s) && /(стекло|glass)/i.test(s)) return 'закаленное стекло'
      if (/(опал|opale)/i.test(s)) return 'опаловое стекло'
      if (/(стекло|glass)/i.test(s)) return 'стекло'
      // Metals
      if (/(нерж|нержавеющая сталь|stainless)/i.test(s)) return 'нержавеющая сталь'
      if (/(алюм|alum|aluminium|aluminum)/i.test(s)) return 'алюминий'
      if (/(чугун|cast\s*iron)/i.test(s)) return 'чугун'
      if (/(медн|copper)/i.test(s)) return 'медь'
      if (/(латун|brass)/i.test(s)) return 'латунь'
      if (/(эмалир|enamel)/i.test(s)) return 'эмаль'
      // Plastics & polymers
      if (/(меламин|melamine)/i.test(s)) return 'меламин'
      if (/(поликарбонат|pc\b)/i.test(s)) return 'поликарбонат'
      if (/(полипропилен|pp\b)/i.test(s)) return 'полипропилен'
      if (/(полиэтилен|pe\b)/i.test(s)) return 'полиэтилен'
      if (/(акрил|pmma|plexi)/i.test(s)) return 'акрил'
      if (/(трита[нн]|tritan)/i.test(s)) return 'тритан'
      if (/(пвх|pvc)/i.test(s)) return 'пвх'
      if (/(пластик|plastic)/i.test(s)) return 'пластик'
      // Wood & natural
      if (/(дерев|wood)/i.test(s)) return 'дерево'
      if (/(бамбук|bamboo)/i.test(s)) return 'бамбук'
      if (/(ротанг|rattan)/i.test(s)) return 'ротанг'
      if (/(сланец|slate)/i.test(s)) return 'сланец'
      if (/(мрамор|marble)/i.test(s)) return 'мрамор'
      if (/(гранит|granite)/i.test(s)) return 'гранит'
      if (/(камень|stone)/i.test(s)) return 'камень'
      // Others
      if (/(силикон|silicone)/i.test(s)) return 'силикон'
      if (/(стеклокерам|glass\s*ceramic)/i.test(s)) return 'стеклокерамика'
      return s
    }
    const mapColor = (v: string) => {
      const sRaw = (v || '').toString().trim().toLowerCase()
      if (!sRaw) return ''
      const out = ((): string | null => {
        if (/(прозр\.|прозрачн|transparent|clear)/i.test(sRaw)) return 'прозрачный'
        if (/(чёрн\.|чёрный|черн\.|черный|black)/i.test(sRaw)) return 'черный'
        if (/(бел\.|белый|white)/i.test(sRaw)) return 'белый'
        if (/(бордов|марсал|burgundy)/i.test(sRaw)) return 'бордовый'
        if (/(красн|red)/i.test(sRaw)) return 'красный'
        if (/(син(ий)?|blue)/i.test(sRaw)) return 'синий'
        if (/(голуб|cyan|azure|sky)/i.test(sRaw)) return 'голубой'
        if (/(бирюз|teal|turquoise)/i.test(sRaw)) return 'бирюзовый'
        if (/(фиолет|пурпур|лилов|сирен|violet|purple|lilac)/i.test(sRaw)) return 'фиолетовый'
        if (/(розов|pink|fuchsia|magenta)/i.test(sRaw)) return 'розовый'
        if (/(оранж|orange)/i.test(sRaw)) return 'оранжевый'
        if (/(желт|yellow)/i.test(sRaw)) return 'желтый'
        if (/(зел[её]н|green)/i.test(sRaw)) return 'зеленый'
        if (/(дымч|smok|smoke|smoky|smoked)/i.test(sRaw)) return 'дымчатый'
        if (/(янтар|amber)/i.test(sRaw)) return 'янтарный'
        if (/(золот|gold|golden)/i.test(sRaw)) return 'золотистый'
        if (/(серебр|silver)/i.test(sRaw)) return 'серебристый'
        if (/(бронз|bronze)/i.test(sRaw)) return 'бронзовый'
        if (/(медн|copper)/i.test(sRaw)) return 'медный'
        if (/(графит|graphite)/i.test(sRaw)) return 'графитовый'
        if (/(сер(ый|\.)|grey|gray)/i.test(sRaw)) return 'серый'
        if (/(бежев|beige)/i.test(sRaw)) return 'бежевый'
        if (/(коричн|brown|шоколад)/i.test(sRaw)) return 'коричневый'
        if (/(кремов|ivory|молочн)/i.test(sRaw)) return 'кремовый'
        return null
      })()
      return out ?? sRaw
    }
    if (category) {
      // Prefer exact categorySlug match when available
      let tmp = filtered.filter((x) => x.categorySlug === category)
      if (!tmp.length) {
        // Fallback: curated keyword matching for common catalog categories
        const kwBySlug: Record<string, RegExp[]> = {
          'blyuda-tarelki': [/тарелк/i, /блюд/i],
          'stakany': [/стакан/i, /хайбол/i, /олд\s?фэш/i, /коллинз/i],
          'kruzhki': [/кружк/i, /чашк/i],
          'stolovye-pribory': [/столов/i, /ложк/i, /вилк/i, /нож(?!ницы)/i],
          'bokaly': [/бокал/i, /фужер/i],
          'stopki-i-ryumki': [/стопк/i, /рюмк/i],
          'salatniki': [/салатник/i],
          'konteynery-i-emkosti-dlya-hraneniya': [/контейн/i, /емкост/i],
          'banki': [/(?:^|\s)банк[аи](?:\s|$)/i],
          'barnyy-inventar': [/барн/i, /шейкер/i, /стрейн/i, /мудлер/i, /джиггер/i],
          'vspomogatelnyy-inventar': [/аксессуар/i, /вспомогат/i, /сервиро/i, /подстав/i]
        }
        const rules = kwBySlug[category] || []
        if (rules.length) {
          tmp = filtered.filter((p) => {
            const text = [p.title || p.name || '', p.description || '', ...(p.specs ? Object.values(p.specs) : [])].join(' ').toLowerCase()
            return rules.some((re) => re.test(text))
          })
        }
      }
      filtered = tmp
    }
    if (subcategory) filtered = filtered.filter((x) => x.subcategorySlug === subcategory)
    if (material) {
      const mQuery = mapMaterial(material)
      filtered = filtered.filter((x) => {
        const m = mapMaterial(x.material || (x.specs?.['Материал'] || x.specs?.['материал'] || x.specs?.['Material'] || ''))
        return m && m === mQuery
      })
    }
    if (brand) {
      const bq = brand.toLowerCase()
      filtered = filtered.filter((x) => {
        const b = (typeof x.brand === 'string' ? x.brand : x.brand?.name || '').toLowerCase()
        return b === bq
      })
    }
    if (color) {
      const cQuery = mapColor(color)
      filtered = filtered.filter((x) => {
        const c = mapColor(x.color || x.specs?.['Цвет'] || x.specs?.['цвет'] || x.specs?.['Color'] || '')
        return c && c === cQuery
      })
    }
    if (q) {
      const qq = q.toLowerCase()
      filtered = filtered.filter((x) => (x.title || x.name || '').toLowerCase().includes(qq) || (x.description || '').toLowerCase().includes(qq))
    }
    if (priceMin) filtered = filtered.filter((x) => (Number(x.price) || 0) >= priceMin)
    if (priceMax) filtered = filtered.filter((x) => (Number(x.price) || 0) <= priceMax)
    if (inStock === 'true') {
      // No inventory in file mode; assume in stock if price present
      filtered = filtered.filter((x) => (Number(x.price) || 0) > 0)
    }
    if (sort === 'new') filtered.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
    if (sort === 'price_asc') filtered.sort((a, b) => (Number(a.price) || Infinity) - (Number(b.price) || Infinity))
    if (sort === 'price_desc') filtered.sort((a, b) => (Number(b.price) || -1) - (Number(a.price) || -1))
    if (sort === 'material_asc') filtered.sort((a, b) => {
      const am = mapMaterial(String(a.material || (a.specs?.['Материал'] || a.specs?.['материал'] || a.specs?.['Material'] || '')))
      const bm = mapMaterial(String(b.material || (b.specs?.['Материал'] || b.specs?.['материал'] || b.specs?.['Material'] || '')))
      return am.localeCompare(bm, 'ru')
    })
    if (sort === 'color_asc') filtered.sort((a, b) => {
      const ac = mapColor(String(a.color || (a.specs?.['Цвет'] || a.specs?.['цвет'] || a.specs?.['Color'] || '')))
      const bc = mapColor(String(b.color || (b.specs?.['Цвет'] || b.specs?.['цвет'] || b.specs?.['Color'] || '')))
      return ac.localeCompare(bc, 'ru')
    })
    // Custom default ordering: plates first, then a stable daily shuffle of the rest
    if ((!sort || sort === 'popular') && !category) {
      const isPlate = (p: any) => {
        if (p.categorySlug && /blyuda-tarelki/i.test(String(p.categorySlug))) return true
        const text = [p.title || p.name || '', p.description || '', ...(p.specs ? Object.values(p.specs) : [])]
          .join(' ')
          .toLowerCase()
        return /(тарелк|блюд)/i.test(text)
      }
      const plates = filtered.filter(isPlate)
      const rest = filtered.filter((x) => !isPlate(x))
      // Stable daily shuffle so pagination doesn't jump on every request
      const seedStr = new Date().toISOString().slice(0, 10) // YYYY-MM-DD
      const hash = (s: string) => {
        let h = 2166136261 >>> 0 // FNV-1a base
        for (let i = 0; i < s.length; i++) {
          h ^= s.charCodeAt(i)
          h = Math.imul(h, 16777619)
        }
        return h >>> 0
      }
      const seed = hash(seedStr)
      const keyFor = (p: any) => {
        const id = String(p.slug || p.id || p.title || '')
        return (hash(id) ^ seed) >>> 0
      }
      rest.sort((a, b) => keyFor(a) - keyFor(b))
      filtered = [...plates, ...rest]
    }
    const total = filtered.length
    const start = (page - 1) * pageSize
  const items = filtered.slice(start, start + pageSize).map((p) => {
      // Derive image from images[0] or imageUrl; normalize leading 'public/' to '/'
  const img0 = Array.isArray(p.images) && p.images.length ? String(p.images[0]) : (p.imageUrl || '')
  let imageUrl = typeof img0 === 'string' ? img0 : ''
  if (imageUrl.startsWith('public/')) imageUrl = '/' + imageUrl.replace(/^public\//, '')
  if (imageUrl.startsWith('/public/')) imageUrl = imageUrl.replace(/^\/public\//, '/')
      // Build short specs row for catalog cards
  const specs = p.specs || {}
      const firstNonEmpty = (...vals: any[]) => vals.find((v) => v != null && String(v).trim() !== '') || ''
      const materialRaw = firstNonEmpty(p.material, specs['Материал'], specs['материал'], specs['Material'])
      const colorRaw = firstNonEmpty(p.color, specs['Цвет'], specs['цвет'], specs['Color'])
  const capacityRaw = firstNonEmpty(specs['Объем'], specs['Объём'], specs['Емкость'], specs['Capacity'])
  const diameterRaw = firstNonEmpty(specs['Диаметр (мм)'], specs['Диаметр'], specs['Диаметр (см)'])
  const heightRaw = firstNonEmpty(specs['Высота (мм)'], specs['Высота'])
  const widthRaw = firstNonEmpty(specs['Ширина'], specs['Ширина (мм)'])
  const lengthRaw = firstNonEmpty(specs['Длина'], specs['Длина (мм)'])
  const sizeRaw = firstNonEmpty(specs['Размер'], specs['Размеры'], specs['Size'])
  const shortSpecs: string[] = []
      if (materialRaw) shortSpecs.push(String(materialRaw))
      if (colorRaw) shortSpecs.push(String(colorRaw))
  if (capacityRaw) shortSpecs.push(normVol(String(capacityRaw)))
  if (shortSpecs.length < 3 && sizeRaw) shortSpecs.push(normDim(String(sizeRaw)))
      // Determine category for tailored highlights
      const detectCategory = (pp: any): string => {
        const cs = String(pp.categorySlug || '').trim()
        if (cs) return cs
        const text = [pp.title || pp.name || '', pp.description || '', ...(pp.specs ? Object.values(pp.specs) : [])]
          .join(' ')
          .toLowerCase()
        if (/(тарелк|блюд)/i.test(text)) return 'blyuda-tarelki'
        if (/(стакан|хайбол|олд\s?фэш|коллинз)/i.test(text)) return 'stakany'
        if (/(кружк|чашк)/i.test(text)) return 'kruzhki'
        if (/(столов|ложк|вилк|нож(?!ницы))/i.test(text)) return 'stolovye-pribory'
        if (/(бокал|фужер)/i.test(text)) return 'bokaly'
        if (/(стопк|рюмк)/i.test(text)) return 'stopki-i-ryumki'
        if (/салатник/i.test(text)) return 'salatniki'
        if (/(контейн|емкост)/i.test(text)) return 'konteynery-i-emkosti-dlya-hraneniya'
        if (/(?:^|\s)банк[аи](?:\s|$)/i.test(text)) return 'banki'
        if (/(барн|шейкер|стрейн|мудлер|джиггер)/i.test(text)) return 'barnyy-inventar'
        return ''
      }
      const cat = detectCategory(p)
      // Labeled highlights for catalog cards (category-aware)
      type Highlight = { label: string; value: string; kind?: string }
      const highlights: Highlight[] = []
      const push = (label: string, value: string, kind?: string) => {
        if (value && String(value).trim() !== '') highlights.push({ label, value: String(value), kind })
      }
      const sizeCombined = sizeRaw || [lengthRaw, widthRaw, heightRaw].filter(Boolean).map((v) => normDim(String(v))).join(' × ')
      if (/blyuda-tarelki/.test(cat)) {
        push('Диаметр', normDim(String(diameterRaw || sizeCombined)), 'diameter')
        push('Материал', String(materialRaw || ''), 'material')
        push('Цвет', String(colorRaw || ''), 'color')
      } else if (/(stakany|bokaly|stopki-i-ryumki)/.test(cat)) {
        push('Объем', normVol(String(capacityRaw || '')), 'volume')
        push('Материал', String(materialRaw || ''), 'material')
        push('Цвет', String(colorRaw || ''), 'color')
      } else if (/kruzhki/.test(cat)) {
        push('Объем', normVol(String(capacityRaw || '')), 'volume')
        push('Материал', String(materialRaw || ''), 'material')
        push('Цвет', String(colorRaw || ''), 'color')
      } else if (/stolovye-pribory/.test(cat)) {
        push('Длина', normDim(String(lengthRaw || '')), 'length')
        push('Материал', String(materialRaw || ''), 'material')
        push('Цвет', String(colorRaw || ''), 'color')
      } else if (/(banki|konteynery-i-emkosti-dlya-hraneniya)/.test(cat)) {
        push('Объем', normVol(String(capacityRaw || '')), 'volume')
        push('Размер', String(sizeCombined || ''), 'size')
        push('Материал', String(materialRaw || ''), 'material')
      } else if (/salatniki/.test(cat)) {
        push('Диаметр', normDim(String(diameterRaw || '')), 'diameter')
        push('Материал', String(materialRaw || ''), 'material')
        push('Цвет', String(colorRaw || ''), 'color')
      } else if (/barnyy-inventar/.test(cat)) {
        push('Объем', normVol(String(capacityRaw || '')), 'volume')
        push('Материал', String(materialRaw || ''), 'material')
        push('Размер', String(sizeCombined || ''), 'size')
      } else {
        // Generic fallback
        push('Материал', String(materialRaw || ''), 'material')
        push(capacityRaw ? 'Объем' : 'Размер', capacityRaw ? normVol(String(capacityRaw)) : String(sizeCombined || ''), capacityRaw ? 'volume' : 'size')
        push('Цвет', String(colorRaw || ''), 'color')
      }
      return {
        id: p.slug,
        slug: p.slug,
        name: p.title || p.name,
        brand: p.brand ? { name: p.brand } : null,
        price: (p.price != null && p.price !== '') ? Number(p.price) : null,
        imageUrl,
        shortSpecs,
        highlights,
        material: materialRaw || null,
        color: colorRaw || null
      }
    })
    const payload = { total, page, pageSize, items }
    setCache(key, payload)
  const resp = NextResponse.json(payload, { headers: { 'Cache-Control': 'max-age=30, s-maxage=60, stale-while-revalidate=300' } })
    logIfSlow('api/products:file', start, 500, { q: Object.fromEntries(searchParams.entries()) })
    return resp
  } catch (e) {
    return NextResponse.json({ total: 0, page, pageSize, items: [] })
  }
}
