import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { formatKZT } from '../../../../lib/format'
import fs from 'node:fs'
import path from 'node:path'
import { markStart, logIfSlow } from '../../../../lib/timing'
import nextDynamic from 'next/dynamic'
const ProductGallery = nextDynamic(() => import('../../../../components/ProductGallery'), { ssr: false })
const AddToCart = nextDynamic(() => import('../../../../components/AddToCart'), { ssr: false })
// Old phone-order modal removed per request; keep only WhatsApp CTA
import Script from 'next/script'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// AddToCart moved to client component in components/AddToCart.tsx

export async function generateMetadata({ params }: { params: { slug: string } }) {
  // Build metadata using file-DB first, DB if available
  let title = 'Товар | Horecas Group'
  let description: string | undefined
  let images: string[] = []
  try {
    const file = path.join(process.cwd(), 'data', 'products.json')
    const arr: any[] = JSON.parse(fs.readFileSync(file, 'utf8'))
    const p = arr.find((x: any) => x.slug === params.slug)
    if (p) {
      const metaName = p.title || p.name
      title = `${metaName} — Horecas Group`
      description = p.description || undefined
      images = (Array.isArray(p.images) && p.images.length ? p.images : (p.imageUrl ? [p.imageUrl] : []))
    }
  } catch {}
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: images.length ? images : undefined,
      type: 'website'
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: images.length ? images : undefined
    }
  }
}

export default async function ProductPage({ params }: { params: { slug: string } }) {
  const start = markStart()
  const useFile = (process.env.USE_FILE_DB || 'false').toLowerCase() === 'true'

  // Try DB first unless explicitly using file
  let p: any = null
  let imageUrl = ''
  let images: string[] = []
  let price: number | null = null
  let name = ''
  let brandName: string | null = null
  let description: string | null = null
  let material: string | null = null
  let color: string | null = null
  let specs: Record<string, string> | null = null
  let attributes: any[] = []
  let fromDb = false
  let categorySlug: string | null = null
  let subcategorySlug: string | null = null
  let sku: string | null = null

  if (!useFile) {
    try {
      const { prisma } = await import('../../../../server/prisma')
      p = await prisma.product.findUnique({
        where: { slug: params.slug },
        include: {
          brand: true,
          media: true,
          prices: { orderBy: { createdAt: 'desc' }, take: 1 },
          attributes: { include: { attribute: true } }
        }
      })
      if (p) {
        fromDb = true
        imageUrl = p.media?.[0]?.url || ''
        images = p.media?.length ? p.media.map((m: any) => m.url) : (imageUrl ? [imageUrl] : [])
        price = p.prices?.[0]?.amount != null ? Number(p.prices[0].amount) : null
        name = p.name
        brandName = p.brand?.name || null
        description = p.description || null
        material = p.material || null
        color = p.color || null
        attributes = p.attributes || []
        // Try to extract sku from attributes
        const skuAttr = attributes.find((a: any) => /артикул/i.test(a.attribute?.name || ''))
        sku = skuAttr?.value || null
      }
    } catch {}
  }

  if (!p) {
    // Fallback to file DB
    try {
      const file = path.join(process.cwd(), 'data', 'products.json')
      const arr: any[] = JSON.parse(fs.readFileSync(file, 'utf8'))
      const fp = arr.find((x: any) => x.slug === params.slug)
      if (fp) {
        name = fp.title || fp.name
        // Normalize image paths: ensure strings, and convert 'public/...' to '/...'
  const rawMain = Array.isArray(fp.images) && fp.images.length ? String(fp.images[0]) : (typeof fp.imageUrl === 'string' ? fp.imageUrl : '')
  if (rawMain.startsWith('public/')) imageUrl = '/' + rawMain.replace(/^public\//, '')
  else if (rawMain.startsWith('/public/')) imageUrl = rawMain.replace(/^\/public\//, '/')
  else imageUrl = rawMain
  const rawImages = Array.isArray(fp.images) ? fp.images.filter((s: any) => typeof s === 'string') : (imageUrl ? [imageUrl] : [])
  const normalizedImages = rawImages.map((s: string) => s.startsWith('public/') ? '/' + s.replace(/^public\//, '') : (s.startsWith('/public/') ? s.replace(/^\/public\//, '/') : s))
        images = normalizedImages.length ? normalizedImages : (imageUrl ? [imageUrl] : [])
        price = fp.price != null && fp.price !== '' ? Number(fp.price) : null
        brandName = fp.brand || null
        description = fp.description || null
        material = fp.material || null
        color = fp.color || null
        specs = fp.specs || null
        categorySlug = fp.categorySlug || null
        subcategorySlug = fp.subcategorySlug || null
        // sku from specs if present
        if (specs) {
          const key = Object.keys(specs).find((k) => /артикул/i.test(k))
          if (key) sku = specs[key]
        }
      }
    } catch {}
    if (!name) {
      // Friendly product-not-found view (no 404)
      return (
        <div className="container py-10">
          <nav className="text-sm text-white/60 mb-4">
            <Link className="hover:text-white" href="/ru">Главная</Link>
            <span className="mx-2">›</span>
            <Link className="hover:text-white" href="/ru/catalog">Каталог</Link>
          </nav>
          <h1 className="text-2xl font-semibold mb-2">Товар не найден</h1>
          <p className="text-white/70 mb-6">К сожалению, мы не смогли найти товар по указанному адресу. Возможно, он был удалён или временно недоступен.</p>
          <Link href="/ru/catalog" className="inline-flex items-center rounded-md bg-amber-600 text-white px-4 py-2 text-sm hover:bg-amber-700">Вернуться в каталог</Link>
        </div>
      )
    }
  }

  // Compute availability
  let availability = 'https://schema.org/OutOfStock'
  if (fromDb && p) {
    try {
      const { prisma } = await import('../../../../server/prisma')
      const invAgg = await prisma.inventory.aggregate({ _sum: { quantity: true }, where: { productId: p.id } })
      const totalQty = invAgg._sum.quantity ?? 0
      availability = 'https://schema.org/' + (totalQty > 0 ? 'InStock' : 'OutOfStock')
    } catch {}
  } else {
    availability = price && price > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock'
  }

  // Helpers to sanitize noisy scraped texts
  const collapseWs = (s: string) => s.replace(/[\s\u00A0]+/g, ' ').trim()
  const titleCaseRu = (s: string) => s.split(' ').map(w => w ? (w[0].toUpperCase() + w.slice(1)) : '').join(' ')
  const normalizeCase = (s: string) => {
    const t = s.trim()
    if (!t) return t
    // If value is ALL CAPS in Cyrillic/Latin, convert to Title Case
    const isAllCaps = /[A-ZА-ЯЁ]/.test(t) && t === t.toUpperCase()
    if (isAllCaps) {
      const lower = t.toLowerCase()
      // Keep common abbreviations uppercased
      let out = titleCaseRu(lower)
      out = out.replace(/\bсвч\b/gi, 'СВЧ')
      out = out.replace(/\bпмм\b/gi, 'ПММ')
      return out
    }
    return t
  }
  const sanitizeSpecValue = (v: any) => {
    let s = String(v ?? '').trim()
    if (!s) return ''
    // Remove marketplace junk
    s = s.replace(/Найти\s+похож[иы]е/gi, '')
    s = s.replace(/Сообщить\s+о\s+неточности[\s\S]*$/gi, '')
    s = s.replace(/Магазин\s+и\s+адрес[\s\S]*$/gi, '')
    s = s.replace(/Комплекс-?Бар[\s\S]*$/gi, '')
    s = s.replace(/Двигайте\s+карту[\s\S]*$/gi, '')
    s = collapseWs(s)
    s = normalizeCase(s)
    return s
  }
  const sanitizeDescription = (v: any) => {
    let s = String(v ?? '').trim()
    if (!s) return ''
    const patterns = [
      /Сообщить\s+о\s+неточности[\s\S]*/gi,
      /Магазин\s+и\s+адрес[\s\S]*/gi,
      /Режим\s+работы[\s\S]*/gi,
      /Телефон[\s\S]*/gi,
      /Доступность[\s\S]*/gi,
      /Склад[\s\S]*/gi,
      /Комплекс-?Бар[\s\S]*/gi,
      /Под\s+заказ[\s\S]*/gi,
      /По\s+вашему\s+запросу[\s\S]*/gi,
      /Двигайте\s+карту[\s\S]*/gi,
      /Найти\s+похож[иы]е/gi
    ]
    for (const re of patterns) s = s.replace(re, '')
    s = collapseWs(s)
    return s
  }

  // Sanitize description if present
  if (description) description = sanitizeDescription(description)

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name,
    image: images && images.length ? images : (imageUrl ? [imageUrl] : []),
    brand: brandName || undefined,
    description: description || undefined,
    sku: sku || undefined,
    offers: price ? { '@type': 'Offer', priceCurrency: 'KZT', price, availability } : undefined
  }

  // Breadcrumbs JSON-LD (optional category/subcategory)
  const site = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3001'
  const crumbs: any[] = [
    { '@type': 'ListItem', position: 1, name: 'Главная', item: `${site}/ru` },
    { '@type': 'ListItem', position: 2, name: 'Каталог', item: `${site}/ru/catalog` }
  ]
  if (categorySlug) {
    crumbs.push({ '@type': 'ListItem', position: 3, name: String(categorySlug), item: `${site}/ru/catalog?category=${categorySlug}` })
  }
  if (subcategorySlug) {
    const pos = crumbs.length + 1
    crumbs.push({ '@type': 'ListItem', position: pos, name: String(subcategorySlug), item: `${site}/ru/catalog?category=${categorySlug}&subcategory=${subcategorySlug}` })
  }
  const finalPos = crumbs.length + 1
  crumbs.push({ '@type': 'ListItem', position: finalPos, name: name || 'Товар', item: `${site}/ru/product/${params.slug}` })
  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs
  }

  // Compute similar products (file-DB first) with simple relevance scoring
  let similar: any[] = []
  try {
    const file = path.join(process.cwd(), 'data', 'products.json')
    const arr: any[] = JSON.parse(fs.readFileSync(file, 'utf8'))
    const base = arr.find((x) => x.slug === params.slug) || {}
    const baseCat = categorySlug || base.categorySlug
    const baseSub = subcategorySlug || base.subcategorySlug
    const norm = (s: any) => (s ?? '').toString().trim().toLowerCase()
    const mapMaterial = (v: any) => {
      const s = norm(v)
      if (!s) return ''
      if (/(фарфор|porcelain)/i.test(s)) return 'фарфор'
      if (/(керамик|ceramic)/i.test(s)) return 'керамика'
      if (/(стекло|glass)/i.test(s)) return 'стекло'
      if (/(нерж|нержавеющая сталь|stainless)/i.test(s)) return 'нержавеющая сталь'
      if (/(пластик|plastic)/i.test(s)) return 'пластик'
      return s
    }
    const mapColor = (v: any) => {
      const s = norm(v)
      if (!s) return ''
      if (/(белый|white)/i.test(s)) return 'белый'
      if (/(чёрный|черный|black)/i.test(s)) return 'черный'
      if (/(красн|red)/i.test(s)) return 'красный'
      if (/(син|blue)/i.test(s)) return 'синий'
      if (/(зелён|зелен|green)/i.test(s)) return 'зеленый'
      if (/(прозрачн|transparent|clear)/i.test(s)) return 'прозрачный'
      if (/(сер(ый|ый)|grey|gray)/i.test(s)) return 'серый'
      if (/(бежев|beige)/i.test(s)) return 'бежевый'
      if (/(коричн|brown)/i.test(s)) return 'коричневый'
      return s
    }
    const extractSizeTokens = (src: any) => {
      const txt = norm(src)
      const tokens = new Set<string>()
      const re = /(\d+[\.,]?\d*)\s?(см|mm|мм|ml|мл|л|l)\b/gi
      let m
      while ((m = re.exec(txt))) {
        const val = m[1].replace(',', '.')
        const unit = m[2].toLowerCase()
        let t = ''
        if (unit === 'см') t = `${val}cm`
        else if (unit === 'mm' || unit === 'мм') t = `${val}mm`
        else if (unit === 'ml' || unit === 'мл') t = `${val}ml`
        else if (unit === 'л' || unit === 'l') t = `${val}l`
        if (t) tokens.add(t)
      }
      return tokens
    }
    const baseName = norm(name || base.title || base.name)
    const baseSpecs: Record<string, any> = specs || base.specs || {}
    const baseMat = mapMaterial(material || base.material || baseSpecs['Материал'] || baseSpecs['материал'] || baseSpecs['Material'])
    const baseCol = mapColor(color || base.color || baseSpecs['Цвет'] || baseSpecs['цвет'] || baseSpecs['Color'])
    const baseBrand = norm(brandName || (typeof base.brand === 'string' ? base.brand : base.brand?.name))
    const baseSizeTokens = new Set<string>([
      ...extractSizeTokens(baseName),
      ...extractSizeTokens(Object.values(baseSpecs).join(' '))
    ])

    // Helper to normalize image URL
    const normImage = (p: any) => {
      const img0 = Array.isArray(p.images) && p.images.length ? String(p.images[0]) : (p.imageUrl || '')
      let u = typeof img0 === 'string' ? img0 : ''
      if (u.startsWith('public/')) u = '/' + u.replace(/^public\//, '')
      if (u.startsWith('/public/')) u = u.replace(/^\/public\//, '/')
      return u
    }

    const candidates = arr.filter((x) => x.slug !== params.slug)
    const scored = candidates.map((c) => {
      const cSpecs: Record<string, any> = c.specs || {}
      const cBrand = norm(typeof c.brand === 'string' ? c.brand : c.brand?.name)
      const cMat = mapMaterial(c.material || cSpecs['Материал'] || cSpecs['материал'] || cSpecs['Material'])
      const cCol = mapColor(c.color || cSpecs['Цвет'] || cSpecs['цвет'] || cSpecs['Color'])
      const cName = norm(c.title || c.name)
      const cTokens = new Set<string>([
        ...extractSizeTokens(cName),
        ...extractSizeTokens(Object.values(cSpecs).join(' '))
      ])
      let score = 0
      if (baseSub && c.subcategorySlug === baseSub) score += 3
      else if (baseCat && c.categorySlug === baseCat) score += 2
      if (baseBrand && cBrand && cBrand === baseBrand) score += 2
      if (baseMat && cMat && cMat === baseMat) score += 1
      if (baseCol && cCol && cCol === baseCol) score += 1
      // Size token overlap
      let overlap = 0
      if (baseSizeTokens.size && cTokens.size) {
        for (const t of baseSizeTokens) if (cTokens.has(t)) { overlap++; if (overlap > 1) break }
      }
      if (overlap >= 2) score += 2
      else if (overlap === 1) score += 1
      const imageUrl = normImage(c)
      const price = (c.price != null && c.price !== '') ? Number(c.price) : null
      const hasImage = typeof imageUrl === 'string' && imageUrl.trim() !== ''
      return { score, imageUrl, price, slug: c.slug, name: c.title || c.name }
    })
    similar = scored
      .filter((s) => s.score > 0 && s.name && s.slug && s.imageUrl)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
  } catch {}

  const view = (
    <div className="container py-10">
      <nav className="text-sm text-gray-500 mb-4">
        <Link className="hover:text-gray-800" href="/ru">Главная</Link>
        <span className="mx-2">›</span>
        <Link className="hover:text-gray-800" href="/ru/catalog">Каталог</Link>
        {categorySlug && (
          <>
            <span className="mx-2">›</span>
            <Link className="hover:text-gray-800" href={`/ru/catalog?category=${categorySlug}`}>{categorySlug}</Link>
          </>
        )}
        {subcategorySlug && (
          <>
            <span className="mx-2">›</span>
            <Link className="hover:text-gray-800" href={`/ru/catalog?category=${categorySlug}&subcategory=${subcategorySlug}`}>{subcategorySlug}</Link>
          </>
        )}
        <span className="mx-2">›</span>
        <span className="text-gray-900">{name}</span>
      </nav>
      <div className="grid md:grid-cols-2 gap-8">
        {Array.isArray(images) && images.length > 0 ? (
          <ProductGallery images={images} name={name} />
        ) : (
          <div className="relative aspect-square rounded-lg overflow-hidden bg-black/20">
            <Image src={imageUrl || '/no-image.svg'} alt={name} fill className="object-cover" />
          </div>
        )}
        <div>
          <h1 className="text-3xl font-bold mb-2">{name}</h1>
          {brandName && <div className="text-gray-600 mb-4">Бренд: {brandName}</div>}
          {price && <div className="text-brand-gold text-2xl font-extrabold mb-6">{formatKZT(price)}</div>}
          {sku && <div className="text-gray-600 mb-2">Артикул: {sku}</div>}
          {description && <p className="text-gray-800 leading-relaxed mb-6">{description}</p>}
          {/* Actions */}
          <div className="flex items-center gap-3 flex-wrap">
            <AddToCart slug={params.slug} name={name} price={price} imageUrl={imageUrl} />
            {/* WhatsApp order */}
            {(() => {
              const site = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3001'
              const url = `${site}/ru/product/${params.slug}`
              const text = encodeURIComponent(`Здравствуйте! Хочу заказать: ${name} — ${url}`)
              const wa = `https://wa.me/77763118110?text=${text}`
              return (
                <a href={wa} target="_blank" rel="noopener noreferrer" className="btn-primary">
                  Заказать
                </a>
              )
            })()}
          </div>
          {(() => {
            // Build curated sections similar to screenshot; filter out garbage like categories/marketing tags
            const s: Record<string, any> = specs || {}
            const get = (...keys: string[]) => {
              for (const k of keys) {
                if (s[k] != null && String(s[k]).trim() !== '') return sanitizeSpecValue(String(s[k]))
              }
              return ''
            }
            // Map of sections to rows
            const sections: { title: string; rows: Array<{ k: string; v: string }> }[] = []
            // Unit normalization helpers (to mm, ml)
            const toNumber = (s: string) => Number(String(s).replace(',', '.').replace(/[^0-9.]/g, ''))
            const normDim = (v: string) => {
              const m = String(v||'').match(/([0-9]+[\.,]?[0-9]*)\s*(мм|cm|см|mm)?/i)
              if (!m) return v
              const num = toNumber(m[1])
              const unit = (m[2]||'мм').toLowerCase()
              if (unit === 'см' || unit === 'cm') return Math.round(num * 10) + ' мм'
              return Math.round(num) + ' мм'
            }
            const normVol = (v: string) => {
              const m = String(v||'').match(/([0-9]+[\.,]?[0-9]*)\s*(мл|ml|л|l)?/i)
              if (!m) return v
              const num = toNumber(m[1])
              const unit = (m[2]||'мл').toLowerCase()
              if (unit === 'л' || unit === 'l') return Math.round(num * 1000) + ' мл'
              return Math.round(num) + ' мл'
            }
            const detectCategory = () => {
              const cs = String(categorySlug || '').trim()
              if (cs) return cs
              const text = [name||'', description||'', ...(specs ? Object.values(specs) : [])].join(' ').toLowerCase()
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
            const cat = detectCategory()

            // Manufacturer data
            const manufacturer = sanitizeSpecValue(get('Производитель', 'Бренд', 'Бренд/Производитель') || (brandName || ''))
            const country = sanitizeSpecValue(get('Страна', 'Страна производитель', 'Страна происхождения'))
            const article = sanitizeSpecValue(sku || get('Артикул', 'Код товара', 'Артикул производителя'))
            const series = sanitizeSpecValue(get('Серия', 'Коллекция'))
            const manufacturerRows = [
              manufacturer ? { k: 'Производитель', v: manufacturer } : null,
              series ? { k: 'Серия', v: series } : null,
              country ? { k: 'Страна', v: country } : null,
              article ? { k: 'Артикул', v: article } : null,
            ].filter(Boolean) as Array<{k:string;v:string}>
            if (manufacturerRows.length) sections.push({ title: 'Данные о производителе', rows: manufacturerRows })

            // Main characteristics
            const materialV = sanitizeSpecValue(material || get('Материал', 'материал', 'Material'))
            const stackable = get('Возможность штабелирования', 'Штабелируется')
            const normalizeShape = (v: string) => {
              const s = (v||'').toString().trim().toLowerCase()
              if (!s) return ''
              if (/кругл/.test(s) || /round/i.test(s)) return 'Круглая'
              if (/оваль/.test(s) || /oval/i.test(s)) return 'Овальная'
              if (/прямоуг/.test(s) || /rect/i.test(s)) return 'Прямоугольная'
              if (/квадрат/.test(s) || /square/i.test(s)) return 'Квадратная'
              if (/треугол/.test(s) || /triang/i.test(s)) return 'Треугольная'
              if (/бочон|barrel/i.test(s)) return 'Бочонок'
              if (/конос|конус/i.test(s)) return 'Конусовидная'
              return s.charAt(0).toUpperCase() + s.slice(1)
            }
            const shape = normalizeShape(get('Форма'))
            const decor = get('Тип декора', 'Декор')
            const mainRows = [
              materialV ? { k: 'Материал', v: materialV } : null,
              shape ? { k: 'Форма', v: shape } : null,
              decor ? { k: 'Тип декора', v: decor } : null,
              stackable ? { k: 'Возможность штабелирования', v: stackable } : null,
            ].filter(Boolean) as Array<{k:string;v:string}>
            if (mainRows.length) sections.push({ title: 'Основные характеристики', rows: mainRows })

            // Dimensions
            const diameter = get('Диаметр (мм)', 'Диаметр', 'Диаметр (см)')
            const height = get('Высота (мм)', 'Высота')
            const width = get('Ширина', 'Ширина (мм)')
            const length = get('Длина', 'Длина (мм)')
            const volume = get('Объем', 'Объём', 'Емкость', 'Ёмкость', 'Capacity')
            const weight = get('Вес (г)', 'Вес')
            // Build prioritized dimension rows by category with normalized units
            const dims: Array<{k:string;v:string}> = []
            const add = (k: string, v?: string|null, norm?: (x:string)=>string) => {
              if (!v) return
              const val = norm ? norm(String(v)) : String(v)
              if (!val.trim()) return
              dims.push({ k, v: val })
            }
            if (/blyuda-tarelki/.test(cat)) {
              add('Диаметр', diameter, normDim)
              add('Высота', height, normDim)
              add('Вес', weight)
            } else if (/(stakany|bokaly|stopki-i-ryumki)/.test(cat)) {
              add('Объем', volume, normVol)
              add('Высота', height, normDim)
              add('Диаметр', diameter, normDim)
              add('Вес', weight)
            } else if (/kruzhki/.test(cat)) {
              add('Объем', volume, normVol)
              add('Высота', height, normDim)
              add('Вес', weight)
            } else if (/stolovye-pribory/.test(cat)) {
              add('Длина', length, normDim)
              add('Вес', weight)
            } else if (/(banki|konteynery-i-emkosti-dlya-hraneniya)/.test(cat)) {
              add('Объем', volume, normVol)
              // Show L×W×H if available
              const sizeCombined = [length, width, height].filter(Boolean).map((v)=>normDim(String(v))).join(' × ')
              if (sizeCombined) dims.push({ k: 'Размер', v: sizeCombined })
              add('Вес', weight)
            } else {
              // Generic fallback
              add('Объем', volume, normVol)
              add('Диаметр', diameter, normDim)
              add('Высота', height, normDim)
              add('Длина', length, normDim)
              add('Ширина', width, normDim)
              add('Вес', weight)
            }
            const dimRows = dims
            if (dimRows.length) sections.push({ title: 'Габариты', rows: dimRows })

            // Appearance
            const colorV = sanitizeSpecValue(color || get('Цвет', 'цвет', 'Color'))
            const rimHeight = get('Высота борта')
            const rimWidth = get('Ширина борта')
            const rimType = get('Тип борта')
            const appearanceRows = [
              colorV ? { k: 'Цвет', v: colorV } : null,
              rimType ? { k: 'Тип борта', v: rimType } : null,
              rimHeight ? { k: 'Высота борта', v: rimHeight } : null,
              rimWidth ? { k: 'Ширина борта', v: rimWidth } : null,
            ].filter(Boolean) as Array<{k:string;v:string}>
            if (appearanceRows.length) sections.push({ title: 'Внешний вид', rows: appearanceRows })

            // Features
            const dishwasher = get('Использование в посудомоечной машине', 'Можно мыть в ПММ')
            const microwave = get('Использование в СВЧ', 'Подходит для СВЧ')
            const temperature = get('Температурный режим', 'Температура использования')
            const forDish = get('Для блюда', 'Назначение')
            const featuresRows = [
              dishwasher ? { k: 'Посудомоечная машина', v: dishwasher } : null,
              microwave ? { k: 'Микроволновая печь', v: microwave } : null,
              temperature ? { k: 'Температурный режим', v: temperature } : null,
              forDish ? { k: 'Для блюда', v: forDish } : null,
            ].filter(Boolean) as Array<{k:string;v:string}>
            if (featuresRows.length) sections.push({ title: 'Особенности', rows: featuresRows })

            // Packaging
            const packQty = get('Количество (шт)', 'Количество в упаковке', 'Упаковка, шт')
            const packagingRows = [ packQty ? { k: 'Количество в упаковке', v: packQty } : null ].filter(Boolean) as Array<{k:string;v:string}>
            if (packagingRows.length) sections.push({ title: 'Упаковка и комплектация', rows: packagingRows })

            if (sections.length === 0) {
              // Fallback simple table
              if (material || color) {
                return (
                  <table className="w-full text-sm border-separate border-spacing-y-2">
                    <tbody>
                      {material && (<tr><td className="text-white/60 pr-4 align-top">Материал</td><td className="font-medium">{material}</td></tr>)}
                      {color && (<tr><td className="text-white/60 pr-4 align-top">Цвет</td><td className="font-medium">{color}</td></tr>)}
                    </tbody>
                  </table>
                )
              }
              return null
            }

            return (
              <div className="space-y-6">
                {sections.map((sec) => (
                  <div key={sec.title} className="rounded-xl border border-gray-200 overflow-hidden">
                    <div className="bg-gray-50 px-4 py-3 text-gray-900 font-semibold tracking-wide">{sec.title}</div>
                    <dl className="grid grid-cols-1 sm:grid-cols-2">
                      {sec.rows.map(({ k, v }) => (
                        <div key={k} className="flex border-t border-gray-200 odd:bg-gray-50">
                          <dt className="w-1/2 px-4 py-3 text-gray-600">{k}</dt>
                          <dd className="w-1/2 px-4 py-3 text-gray-900 font-medium">
                            {k === 'Цвет' ? (
                              <span className="inline-flex items-center gap-2">
                                <ColorSwatch value={v} />
                                <span>{v}</span>
                              </span>
                            ) : (
                              v
                            )}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                ))}
              </div>
            )
          })()}
        </div>
      </div>
      {/* Similar products */}
      {similar.length > 0 && (
        <div className="mt-12">
          <h2 className="text-xl font-semibold mb-4">Похожие товары</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {similar.map((s) => (
              <Link key={s.slug} href={`/ru/product/${s.slug}`} className="block rounded-lg border border-gray-200 hover:border-amber-400/60 transition p-3">
                <div className="relative aspect-square rounded-md overflow-hidden bg-black/20">
                  {typeof s.imageUrl === 'string' && s.imageUrl.startsWith('http') ? (
                    <img src={s.imageUrl} alt={s.name} loading="lazy" className="w-full h-full object-cover" />
                  ) : (
                    <Image src={s.imageUrl || '/no-image.svg'} alt={s.name} fill className="object-cover" />
                  )}
                </div>
                <div className="mt-2 text-sm line-clamp-2">{s.name}</div>
                {typeof s.price === 'number' && s.price > 0 ? <div className="text-brand-gold font-bold mt-1">{formatKZT(Number(s.price))}</div> : null}
              </Link>
            ))}
          </div>
        </div>
      )}
      <Script id="jsonld-product" type="application/ld+json" strategy="afterInteractive">
        {JSON.stringify(jsonLd)}
      </Script>
      <Script id="jsonld-breadcrumbs" type="application/ld+json" strategy="afterInteractive">
        {JSON.stringify(breadcrumbLd)}
      </Script>
    </div>
  )
  logIfSlow('page:product', start, 500, { slug: params.slug, fromDb })
  return view
}

function ColorSwatch({ value }: { value: string }) {
  const hex = colorToHex(value)
  const isTransparent = /прозрач/i.test(value)
  return (
    <span className="inline-flex items-center">
      <span className={`inline-block w-3.5 h-3.5 rounded-full ring-1 ring-gray-300 mr-1.5`} style={{ backgroundColor: isTransparent ? 'transparent' : hex }} />
    </span>
  )
}

function colorToHex(v: string = ''): string {
  const s = v.toLowerCase()
  if (/прозрач/.test(s)) return '#ffffff'
  if (/(чёрн|черн|black)/.test(s)) return '#000000'
  if (/(бел|white)/.test(s)) return '#ffffff'
  if (/(красн|red)/.test(s)) return '#ef4444'
  if (/(син|blue)/.test(s)) return '#2563eb'
  if (/(голуб|cyan|azure|sky)/.test(s)) return '#38bdf8'
  if (/(бирюз|teal|turquoise)/.test(s)) return '#14b8a6'
  if (/(фиолет|пурпур|violet|purple)/.test(s)) return '#7c3aed'
  if (/(розов|pink)/.test(s)) return '#ec4899'
  if (/(оранж|orange)/.test(s)) return '#f97316'
  if (/(желт|yellow)/.test(s)) return '#f59e0b'
  if (/(зел[её]н|green)/.test(s)) return '#22c55e'
  if (/(дымч|smok)/.test(s)) return '#94a3b8'
  if (/(янтар|amber)/.test(s)) return '#f59e0b'
  if (/(золот|gold)/.test(s)) return '#fbbf24'
  if (/(серебр|silver)/.test(s)) return '#c0c0c0'
  if (/(бронз|bronze)/.test(s)) return '#b45309'
  if (/(медн|copper)/.test(s)) return '#b45309'
  if (/(графит|graphite)/.test(s)) return '#374151'
  if (/(сер(ый|\.)|grey|gray)/.test(s)) return '#9ca3af'
  if (/(бежев|beige)/.test(s)) return '#d6bc8b'
  if (/(коричн|brown)/.test(s)) return '#92400e'
  if (/(кремов|ivory|молочн)/.test(s)) return '#f3e8d2'
  return '#9ca3af'
}
