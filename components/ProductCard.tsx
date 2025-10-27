"use client"
import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useCart } from '../lib/cart'
import { formatKZT } from '../lib/format'

export default function ProductCard({ product }: { product: any }) {
  const pathname = usePathname()
  const lng = pathname?.split('/').filter(Boolean)[0] || 'ru'
  const href = `/${lng}/product/${product.slug}`
  const { add } = useCart()
  const imgSrc: string = (product?.imageUrl || (Array.isArray(product?.images) && product.images[0]) || '/no-image.svg') as string
  return (
    <div className="card card-hover p-3 block">
      <Link href={href} className="group block">
      <div className="relative aspect-square overflow-hidden rounded-md bg-gray-100">
        {imgSrc?.startsWith('http') ? (
          <img src={imgSrc} alt={product?.name || 'Товар'} loading="lazy" className="w-full h-full object-cover" />
        ) : (
          <Image src={imgSrc} alt={product?.name || 'Товар'} fill className="object-cover group-hover:scale-105 transition" sizes="(min-width: 1024px) 25vw, 50vw" />
        )}
      </div>
      <div className="mt-3 space-y-2">
        <div className="text-sm text-gray-500">{product.brand?.name || product.brand || ''}</div>
        <div className="font-semibold leading-tight line-clamp-2">{product.name || 'Товар'}</div>
        {/* Compact real characteristics */}
          {Array.isArray(product.highlights) && product.highlights.length > 0 ? (
            <div className="rounded-md border border-gray-200 bg-white/50">
              <dl className="text-xs divide-y divide-gray-200">
                {product.highlights.slice(0,3).map((h: any) => (
                  <div key={h.label} className="flex">
                    <dt className="w-1/2 px-2 py-1.5 text-gray-500 flex items-center gap-1.5">
                      <Icon kind={h.kind || kindFromLabel(h.label)} />
                      {h.label}
                    </dt>
                    <dd className="w-1/2 px-2 py-1.5 font-medium text-gray-900 line-clamp-1" title={String(h.value)}>{h.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ) : (
          Array.isArray(product.shortSpecs) && product.shortSpecs.length > 0 && (
            <div className="text-xs text-gray-500 line-clamp-2">{product.shortSpecs.filter(Boolean).slice(0,3).join(' • ')}</div>
          )
        )}
        {typeof product.price === 'number' && product.price > 0 && <div className="text-amber-600 font-bold">{formatKZT(product.price)}</div>}
      </div>
      </Link>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button onClick={() => add({ slug: product.slug, name: product.name, price: product.price || 0, imageUrl: product.imageUrl })} className="w-full btn-primary">Добавить в корзину</button>
        <Link href={href} className="w-full inline-flex items-center justify-center rounded-md border border-gray-200 bg-white text-sm hover:bg-gray-50">Подробнее</Link>
      </div>
    </div>
  )
}

function kindFromLabel(label: string = ''): string {
  const l = label.toLowerCase()
  if (/материал/.test(l)) return 'material'
  if (/объем|объём|capacity/.test(l)) return 'volume'
  if (/цвет|color/.test(l)) return 'color'
  if (/диаметр/.test(l)) return 'diameter'
  if (/высота/.test(l)) return 'height'
  if (/длина/.test(l)) return 'length'
  if (/ширина/.test(l)) return 'width'
  if (/размер/.test(l)) return 'size'
  return 'other'
}

function Icon({ kind }: { kind?: string }) {
  const k = kind || 'other'
  const cls = 'w-3.5 h-3.5 text-gray-400'
  switch (k) {
    case 'material':
      // cube-like icon
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className={cls} strokeWidth="1.5">
          <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3Z" />
          <path d="M4 7.5L12 12l8-4.5" />
        </svg>
      )
    case 'volume':
      // beaker
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className={cls} strokeWidth="1.5">
          <path d="M7 3h10M9 3v5l-3 11a3 3 0 003 3h6a3 3 0 003-3L15 8V3" />
          <path d="M9 12h6" />
        </svg>
      )
    case 'diameter':
      // circle with arrows
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className={cls} strokeWidth="1.5">
          <circle cx="12" cy="12" r="7" />
          <path d="M5 12h14M16 9l3 3-3 3M8 15l-3-3 3-3" />
        </svg>
      )
    case 'height':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className={cls} strokeWidth="1.5">
          <path d="M12 3v18M9 6l3-3 3 3M9 18l3 3 3-3" />
        </svg>
      )
    case 'length':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className={cls} strokeWidth="1.5">
          <path d="M3 12h18M6 9l-3 3 3 3M18 9l3 3-3 3" />
        </svg>
      )
    case 'width':
    case 'size':
      // ruler
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className={cls} strokeWidth="1.5">
          <rect x="3" y="6" width="18" height="6" rx="1" />
          <path d="M7 6v6M11 6v3M15 6v6M19 6v3" />
        </svg>
      )
    case 'color':
      // palette
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className={cls} strokeWidth="1.5">
          <path d="M12 3a9 9 0 100 18h2a2 2 0 002-2 2 2 0 012-2 3 3 0 00.5-5.96A9 9 0 0012 3z" />
          <circle cx="8" cy="10" r="1" fill="currentColor" />
          <circle cx="12" cy="8" r="1" fill="currentColor" />
          <circle cx="16" cy="10" r="1" fill="currentColor" />
        </svg>
      )
    default:
      return null
  }
}
