import { NextResponse } from 'next/server'
import fs from 'node:fs'
import path from 'node:path'
import { prisma } from '../../../server/prisma'
import { markStart, logIfSlow } from '../../../lib/timing'

// In-memory cache for facets to reduce FS/DB work
type CacheEntry = { ts: number; data: any }
const CACHE_TTL_MS = 60_000
let facetsCache: CacheEntry | null = null
const normalize = (s: string) => {
  const t = (s || '').toString().trim()
  if (!t) return ''
  // Capitalize first letter, rest lowercased; keep Latin/Cyrillic
  const lower = t.toLowerCase()
  return lower.charAt(0).toUpperCase() + lower.slice(1)
}

// Map material synonyms to unified, human-readable names (Title Case)
const mapMaterial = (v: string) => {
  const s = (v || '').toString().trim().toLowerCase()
  if (!s) return ''
  // Ceramics & porcelain family
  if (/(костян|bone\s*china)/i.test(s)) return 'Костяной фарфор'
  if (/(фарфор|porcelain)/i.test(s)) return 'Фарфор'
  if (/(фаянс|earthenware)/i.test(s)) return 'Фаянс'
  if (/(stone\s*ware|каменн|керамик(а)?\s*камен|грс|грэс)/i.test(s)) return 'Каменная керамика'
  if (/(керамик|ceramic)/i.test(s)) return 'Керамика'
  // Glass types
  if (/(боросил|borosilicate)/i.test(s)) return 'Боросиликатное стекло'
  if (/(закален|tempered)/i.test(s) && /(стекло|glass)/i.test(s)) return 'Закаленное стекло'
  if (/(опал|opale)/i.test(s)) return 'Опаловое стекло'
  if (/(стекло|glass)/i.test(s)) return 'Стекло'
  // Metals
  if (/(нерж|нержавеющая сталь|stainless)/i.test(s)) return 'Нержавеющая сталь'
  if (/(алюм|alum|aluminium|aluminum)/i.test(s)) return 'Алюминий'
  if (/(чугун|cast\s*iron)/i.test(s)) return 'Чугун'
  if (/(медн|copper)/i.test(s)) return 'Медь'
  if (/(латун|brass)/i.test(s)) return 'Латунь'
  if (/(эмалир|enamel)/i.test(s)) return 'Эмаль'
  // Plastics & polymers
  if (/(меламин|melamine)/i.test(s)) return 'Меламин'
  if (/(поликарбонат|pc\b)/i.test(s)) return 'Поликарбонат'
  if (/(полипропилен|pp\b)/i.test(s)) return 'Полипропилен'
  if (/(полиэтилен|pe\b)/i.test(s)) return 'Полиэтилен'
  if (/(акрил|pmma|plexi)/i.test(s)) return 'Акрил'
  if (/(трита[нн]|tritan)/i.test(s)) return 'Тритан'
  if (/(пвх|pvc)/i.test(s)) return 'ПВХ'
  if (/(пластик|plastic)/i.test(s)) return 'Пластик'
  // Wood & natural
  if (/(дерев|wood)/i.test(s)) return 'Дерево'
  if (/(бамбук|bamboo)/i.test(s)) return 'Бамбук'
  if (/(ротанг|rattan)/i.test(s)) return 'Ротанг'
  if (/(сланец|slate)/i.test(s)) return 'Сланец'
  if (/(мрамор|marble)/i.test(s)) return 'Мрамор'
  if (/(гранит|granite)/i.test(s)) return 'Гранит'
  if (/(камень|stone)/i.test(s)) return 'Камень'
  // Others
  if (/(силикон|silicone)/i.test(s)) return 'Силикон'
  if (/(стеклокерам|glass\s*ceramic)/i.test(s)) return 'Стеклокерамика'
  return normalize(v)
}
const mapColor = (v: string) => {
  const s = (v || '').toString().trim().toLowerCase()
  if (!s) return ''
  // Abbreviations and multilingual synonyms first
  if (/(прозр\.|прозрачн|transparent|clear)/i.test(s)) return 'Прозрачный'
  if (/(чёрн\.|чёрный|черн\.|черный|black)/i.test(s)) return 'Черный'
  if (/(бел\.|белый|white)/i.test(s)) return 'Белый'
  if (/(красн|red|бордов|марсал|burgundy)/i.test(s)) return /бордов|марсал/i.test(s) ? 'Бордовый' : 'Красный'
  if (/(син(ий)?|blue)/i.test(s)) return 'Синий'
  if (/(голуб|cyan|azure|sky)/i.test(s)) return 'Голубой'
  if (/(бирюз|teal|turquoise)/i.test(s)) return 'Бирюзовый'
  if (/(фиолет|пурпур|лилов|сирен|violet|purple|lilac)/i.test(s)) return 'Фиолетовый'
  if (/(розов|pink|fuchsia|magenta)/i.test(s)) return 'Розовый'
  if (/(оранж|orange)/i.test(s)) return 'Оранжевый'
  if (/(желт|yellow)/i.test(s)) return 'Желтый'
  if (/(зел[её]н|green)/i.test(s)) return 'Зеленый'
  if (/(дымч|smok|smoke|smoky|smoked)/i.test(s)) return 'Дымчатый'
  if (/(янтар|amber)/i.test(s)) return 'Янтарный'
  if (/(золот|gold|golden)/i.test(s)) return 'Золотистый'
  if (/(серебр|silver)/i.test(s)) return 'Серебристый'
  if (/(бронз|bronze)/i.test(s)) return 'Бронзовый'
  if (/(медн|copper)/i.test(s)) return 'Медный'
  if (/(графит|graphite)/i.test(s)) return 'Графитовый'
  if (/(сер(ый|\.)|grey|gray)/i.test(s)) return 'Серый'
  if (/(бежев|beige)/i.test(s)) return 'Бежевый'
  if (/(коричн|brown|шоколад)/i.test(s)) return 'Коричневый'
  if (/(кремов|ivory|молочн)/i.test(s)) return 'Кремовый'
  return normalize(v)
}
function getCached() {
  if (!facetsCache) return null
  if (Date.now() - facetsCache.ts > CACHE_TTL_MS) { facetsCache = null; return null }
  return facetsCache.data
}
function setCached(data: any) { facetsCache = { ts: Date.now(), data } }

export async function GET() {
  const start = markStart()
  const cached = getCached()
  if (cached) return NextResponse.json(cached, { headers: { 'Cache-Control': 's-maxage=300, stale-while-revalidate=600' } })
  const useFile = (process.env.USE_FILE_DB || 'false').toLowerCase() === 'true'
  if (!useFile) {
    try {
      // Try to compute facets from DB where possible
      const [categories, brands, materials] = await Promise.all([
        prisma.category.findMany({ select: { slug: true, name: true } }),
        prisma.brand.findMany({ select: { name: true } }),
        prisma.product.findMany({ distinct: ['material'], select: { material: true } })
      ])
      const cats = (categories as Array<{ slug: string; name: string }>).map((c) => ({ slug: c.slug, name: c.name }))
      const brs = (brands as Array<{ name: string }>).map((b) => ({ name: b.name }))
      const mats = (materials as Array<{ material: string | null }>).filter((m) => !!m.material).map((m) => m.material as string)
      // Enrich from file DB when DB lacks data (or for colors which DB doesn't provide)
      let finalBrands: any = brs
      let finalMaterials: any = mats
      let colors: Array<{ name: string; count?: number }> = []
      let curatedCategories: Array<{ slug: string; name: string; count?: number }> = []
      try {
        const dir = path.join(process.cwd(), 'data')
        const prodFile = path.join(dir, 'products.json')
        const arr: any[] = JSON.parse(fs.readFileSync(prodFile, 'utf8'))
        const brandCount = new Map<string, number>()
        const materialCount = new Map<string, number>()
        const colorCount = new Map<string, number>()
        const curatedDefs: Array<{ slug: string; name: string; keywords: RegExp[] }> = [
          { slug: 'blyuda-tarelki', name: 'Тарелки', keywords: [/тарелк/i, /блюд/i] },
          { slug: 'stakany', name: 'Стаканы', keywords: [/стакан/i, /хайбол/i, /олд\s?фэш/i, /коллинз/i] },
          { slug: 'kruzhki', name: 'Кружки', keywords: [/кружк/i, /чашк/i] },
          { slug: 'stolovye-pribory', name: 'Столовые приборы', keywords: [/столов/i, /ложк/i, /вилк/i, /нож(?!ницы)/i] },
          { slug: 'bokaly', name: 'Бокалы', keywords: [/бокал/i, /фужер/i] },
          { slug: 'stopki-i-ryumki', name: 'Стопки и рюмки', keywords: [/стопк/i, /рюмк/i] },
          { slug: 'salatniki', name: 'Салатники', keywords: [/салатник/i] },
          { slug: 'konteynery-i-emkosti-dlya-hraneniya', name: 'Контейнеры и емкости', keywords: [/контейн/i, /емкост/i] },
          { slug: 'banki', name: 'Банки', keywords: [/(?:^|\s)банк[аи](?:\s|$)/i] },
          { slug: 'barnyy-inventar', name: 'Барный инвентарь', keywords: [/барн/i, /шейкер/i, /стрейн/i, /мудлер/i, /джиггер/i] },
          { slug: 'vspomogatelnyy-inventar', name: 'Аксессуары', keywords: [/аксессуар/i, /вспомогат/i, /сервиро/i, /подстав/i] }
        ]
        const curatedCounts = new Map<string, number>()
        for (const p of arr) {
          const brand = normalize(typeof p.brand === 'string' ? p.brand : (p.brand?.name || ''))
          if (brand) brandCount.set(brand, (brandCount.get(brand) || 0) + 1)
          const materialRaw = p.material || (p.specs && (p.specs['Материал'] || p.specs['материал'] || p.specs['Material'])) || ''
          const material = mapMaterial(String(materialRaw))
          if (material) materialCount.set(material, (materialCount.get(material) || 0) + 1)
          const colorRaw = p.color || (p.specs && (p.specs['Цвет'] || p.specs['цвет'] || p.specs['Color'])) || ''
          const color = mapColor(String(colorRaw))
          if (color) colorCount.set(color, (colorCount.get(color) || 0) + 1)
          try {
            const text = [p.title || p.name || '', p.description || '', ...(p.specs ? Object.values(p.specs) : [])].join(' ').toLowerCase()
            for (const def of curatedDefs) if (def.keywords.some((re) => re.test(text))) curatedCounts.set(def.slug, (curatedCounts.get(def.slug) || 0) + 1)
          } catch {}
        }
        const brandsFile = Array.from(brandCount.entries()).sort((a,b)=> b[1]-a[1]).map(([name,count]) => ({ name, count }))
        const materialsFile = Array.from(materialCount.entries()).sort((a,b)=> b[1]-a[1]).map(([name,count]) => ({ name, count }))
        colors = Array.from(colorCount.entries()).sort((a,b)=> b[1]-a[1]).map(([name,count]) => ({ name, count }))
        curatedCategories = curatedDefs.map((d)=> ({ slug: d.slug, name: d.name, count: curatedCounts.get(d.slug) || 0})).filter(c=> c.count! > 0)
        if (!brs.length) finalBrands = brandsFile
        if (!mats.length) finalMaterials = materialsFile
      } catch {}
      const payload = { categories: cats, brands: finalBrands, materials: finalMaterials, colors, subcategoriesByCategory: {}, curatedCategories }
      setCached(payload)
  const resp = NextResponse.json(payload, { headers: { 'Cache-Control': 's-maxage=300, stale-while-revalidate=600' } })
  logIfSlow('api/facets:db', start)
  return resp
    } catch {}
  }

  // File DB fallback
  try {
    const dir = path.join(process.cwd(), 'data')
    const prodFile = path.join(dir, 'products.json')
    const catFile = path.join(dir, 'categories.json')
    const arr: any[] = JSON.parse(fs.readFileSync(prodFile, 'utf8'))
  const catSet = new Map<string, { slug: string; name: string; count: number }>()
    const subSet = new Map<string, Map<string, { slug: string; name: string; count: number }>>()
    const brandCount = new Map<string, number>()
    const materialCount = new Map<string, number>()
    const colorCount = new Map<string, number>()
    // Prefer categories.json for names and hierarchy
    let subcategoriesByCategory: Record<string, { slug: string; name: string }[]> = {}
    let categories: { slug: string; name: string; count?: number }[] = []
    const curatedDefs: Array<{ slug: string; name: string; keywords: RegExp[] }> = [
      { slug: 'blyuda-tarelki', name: 'Тарелки', keywords: [/тарелк/i, /блюд/i] },
      { slug: 'stakany', name: 'Стаканы', keywords: [/стакан/i, /хайбол/i, /олд\s?фэш/i, /коллинз/i] },
      { slug: 'kruzhki', name: 'Кружки', keywords: [/кружк/i, /чашк/i] },
      { slug: 'stolovye-pribory', name: 'Столовые приборы', keywords: [/столов/i, /ложк/i, /вилк/i, /нож(?!ницы)/i] },
      { slug: 'bokaly', name: 'Бокалы', keywords: [/бокал/i, /фужер/i] },
      { slug: 'stopki-i-ryumki', name: 'Стопки и рюмки', keywords: [/стопк/i, /рюмк/i] },
      { slug: 'salatniki', name: 'Салатники', keywords: [/салатник/i] },
      { slug: 'konteynery-i-emkosti-dlya-hraneniya', name: 'Контейнеры и емкости', keywords: [/контейн/i, /емкост/i] },
      { slug: 'banki', name: 'Банки', keywords: [/(?:^|\s)банк[аи](?:\s|$)/i] },
      { slug: 'barnyy-inventar', name: 'Барный инвентарь', keywords: [/барн/i, /шейкер/i, /стрейн/i, /мудлер/i, /джиггер/i] },
      { slug: 'vspomogatelnyy-inventar', name: 'Аксессуары', keywords: [/аксессуар/i, /вспомогат/i, /сервиро/i, /подстав/i] }
    ]
    const curatedCounts = new Map<string, number>()
    try {
      const cats: Array<{ slug: string; name: string; parentSlug: string | null }> = JSON.parse(fs.readFileSync(catFile, 'utf8'))
      const top: Record<string, { slug: string; name: string }> = {}
      const subs: Record<string, { slug: string; name: string }[]> = {}
      for (const c of cats) {
        if (!c.parentSlug) { top[c.slug] = { slug: c.slug, name: c.name }; continue }
        if (!subs[c.parentSlug]) subs[c.parentSlug] = []
        subs[c.parentSlug].push({ slug: c.slug, name: c.name })
      }
      subcategoriesByCategory = subs
      categories = Object.values(top)
    } catch {}
    for (const p of arr) {
      if (p.categorySlug) {
        const existing = catSet.get(p.categorySlug)
        if (existing) existing.count += 1; else catSet.set(p.categorySlug, { slug: p.categorySlug, name: p.categorySlug, count: 1 })
      }
      if (p.categorySlug && p.subcategorySlug) {
        if (!subSet.has(p.categorySlug)) subSet.set(p.categorySlug, new Map())
        const m = subSet.get(p.categorySlug)!
        const ex = m.get(p.subcategorySlug)
        if (ex) ex.count += 1; else m.set(p.subcategorySlug, { slug: p.subcategorySlug, name: p.subcategorySlug, count: 1 })
      }
  const brand = normalize(typeof p.brand === 'string' ? p.brand : (p.brand?.name || ''))
  if (brand) brandCount.set(brand, (brandCount.get(brand) || 0) + 1)
  const materialRaw = p.material || (p.specs && (p.specs['Материал'] || p.specs['материал'] || p.specs['Material'])) || ''
  const material = mapMaterial(String(materialRaw))
  if (material) materialCount.set(material, (materialCount.get(material) || 0) + 1)
  const colorRaw = p.color || (p.specs && (p.specs['Цвет'] || p.specs['цвет'] || p.specs['Color'])) || ''
  const color = mapColor(String(colorRaw))
  if (color) colorCount.set(color, (colorCount.get(color) || 0) + 1)

      // Curated category counting by keyword match (title + specs values)
      try {
        const text = [p.title || p.name || '', p.description || '',
          ...(p.specs ? Object.values(p.specs) : [])
        ].join(' ').toLowerCase()
        for (const def of curatedDefs) {
          if (def.keywords.some((re) => re.test(text))) {
            curatedCounts.set(def.slug, (curatedCounts.get(def.slug) || 0) + 1)
          }
        }
      } catch {}
    }
    // If we didn't read categories.json, fall back to derived categories
    if (!categories.length) categories = Array.from(catSet.values())
    // Sort by count desc
    categories.sort((a,b)=> (b.count||0)-(a.count||0))
    const brands = Array.from(brandCount.entries()).sort((a,b)=> b[1]-a[1]).map(([name,count]) => ({ name, count }))
    const materials = Array.from(materialCount.entries()).sort((a,b)=> b[1]-a[1]).map(([name,count]) => ({ name, count }))
    const colors = Array.from(colorCount.entries()).sort((a,b)=> b[1]-a[1]).map(([name,count]) => ({ name, count }))
    // Subcategories with counts
    if (!Object.keys(subcategoriesByCategory).length && subSet.size) {
      const obj: Record<string, { slug: string; name: string; count?: number }[]> = {}
      for (const [cat, map] of subSet.entries()) obj[cat] = Array.from(map.values()).sort((a,b)=> (b.count||0)-(a.count||0))
      subcategoriesByCategory = obj
    }
    // Build curatedCategories with counts
    const curatedCategories = curatedDefs
      .map((d) => ({ slug: d.slug, name: d.name, count: curatedCounts.get(d.slug) || 0 }))
      .filter((c) => c.count > 0)
    const payload = { categories, brands, materials, colors, subcategoriesByCategory, curatedCategories }
    setCached(payload)
  const resp = NextResponse.json(payload, { headers: { 'Cache-Control': 's-maxage=300, stale-while-revalidate=600' } })
  logIfSlow('api/facets:file', start)
  return resp
  } catch (e) {
    return NextResponse.json({ categories: [], brands: [], materials: [], colors: [], subcategoriesByCategory: {} })
  }
}
