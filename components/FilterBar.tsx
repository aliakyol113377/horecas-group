"use client"
import { memo, useEffect, useMemo, useRef, useState } from 'react'

type Facets = {
  categories?: { slug: string; name?: string; count?: number }[]
  brands?: { name: string; count?: number }[]
  materials?: { name: string; count?: number }[] | string[]
  colors?: { name: string; count?: number }[]
  curatedCategories?: { slug: string; name: string; count?: number }[]
}

type Props = {
  query: Record<string, string>
  onChange: (q: Record<string, string>) => void
  onReset?: () => void
  facets?: Facets
  vertical?: boolean
}

function FilterBar({ query, onChange, onReset, facets, vertical }: Props) {
  const set = (k: string, v: string) => onChange({ [k]: v })
  const onCategory = (v: string) => onChange({ category: v, subcategory: '' })
  // Debounced search input to reduce request thrash
  const [qLocal, setQLocal] = useState(query.q || '')
  const t = useRef<NodeJS.Timeout | null>(null)
  useEffect(() => {
    if (t.current) clearTimeout(t.current)
    t.current = setTimeout(() => {
      if ((query.q || '') !== qLocal) onChange({ q: qLocal })
    }, 300)
    return () => { if (t.current) clearTimeout(t.current) }
  }, [qLocal, onChange, query.q])
  // Combine curated categories (friendly set pinned first) with full derived categories for "весь ассортимент"
  const catOptions = (() => {
    const curated = (facets?.curatedCategories || []) as Array<{ slug: string; name?: string; count?: number }>
    const all = (facets?.categories || []) as Array<{ slug: string; name?: string; count?: number }>
    if (!curated.length) return all
    const seen = new Set(curated.map(c => c.slug))
    const rest = all.filter(c => !seen.has(c.slug))
    return [...curated, ...rest]
  })()

  // Color name → swatch color map (Russian names), fallback to gray
  const colorSwatch = useMemo(() => {
    const m: Record<string, string> = {
      'прозрачный': 'transparent',
      'черный': '#111827',
      'белый': '#ffffff',
      'бордовый': '#800020',
      'красный': '#ef4444',
      'синий': '#3b82f6',
      'голубой': '#60a5fa',
      'бирюзовый': '#14b8a6',
      'фиолетовый': '#8b5cf6',
      'розовый': '#ec4899',
      'оранжевый': '#f97316',
      'желтый': '#f59e0b',
      'зеленый': '#22c55e',
      'дымчатый': '#6b7280',
      'янтарный': '#d97706',
      'золотистый': '#d4af37',
      'серебристый': '#c0c0c0',
      'бронзовый': '#cd7f32',
      'медный': '#b87333',
      'графитовый': '#374151',
      'серый': '#9ca3af',
      'бежевый': '#f5f5dc',
      'коричневый': '#8b4513',
      'кремовый': '#fffdd0'
    }
    return m
  }, [])

  const renderColorChip = (name: string, count?: number) => {
    const key = (name || '').toString().trim().toLowerCase()
    const isSelected = (query.color || '').toLowerCase() === key
    const bg = colorSwatch[key] ?? '#e5e7eb'
    const isTransparent = bg === 'transparent'
    return (
      <button
        key={name}
        onClick={() => set('color', isSelected ? '' : name)}
        className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition whitespace-nowrap ${isSelected ? 'border-amber-400 bg-amber-50 text-amber-700' : 'border-gray-200 bg-white text-gray-800 hover:bg-gray-50'}`}
        aria-pressed={isSelected}
        title={name}
      >
        <span
          className="inline-block h-4 w-4 rounded-full border border-gray-300"
          style={isTransparent ? { backgroundImage: 'linear-gradient(45deg,#f3f4f6 25%,transparent 25%,transparent 50%,#f3f4f6 50%,#f3f4f6 75%,transparent 75%,transparent)', backgroundSize: '6px 6px' } : { backgroundColor: bg }}
        />
        <span>{name}{typeof count === 'number' && count > 0 ? ` (${count})` : ''}</span>
      </button>
    )
  }

  if (vertical) {
    return (
      <div className="mt-2 space-y-4">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-700">Поиск по каталогу</label>
          <input
            type="search"
            placeholder="Например: бокалы 300 мл"
            value={qLocal}
            onChange={(e) => setQLocal(e.target.value)}
            className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-700">Категория</label>
          <select
            value={query.category || ''}
            onChange={(e) => onCategory(e.target.value)}
            className={`w-full rounded-md border bg-white px-3 py-2 text-sm ${query.category ? 'border-amber-400 ring-2 ring-amber-200' : 'border-gray-200'}`}
          >
            <option value="">Все категории</option>
            {catOptions.map((c: any) => (
              <option key={c.slug} value={c.slug}>{c.name || c.slug}{c.count ? ` (${c.count})` : ''}</option>
            ))}
          </select>
        </div>
        {/* Подкатегория удалена по требованию UX */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-700">Материал</label>
          <select
            value={query.material || ''}
            onChange={(e) => set('material', e.target.value)}
            className={`w-full rounded-md border bg-white px-3 py-2 text-sm ${query.material ? 'border-amber-400 ring-2 ring-amber-200' : 'border-gray-200'}`}
          >
            <option value="">Все материалы</option>
            {(Array.isArray(facets?.materials) ? facets?.materials : []).map((m: any) => {
              const name = typeof m === 'string' ? m : m.name
              const count = typeof m === 'string' ? undefined : m.count
              return <option key={name} value={name}>{name}{count ? ` (${count})` : ''}</option>
            })}
          </select>
        </div>
        {/* Бренд скрыт по требованию: вкладка не отображается */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-700">Цвет</label>
          <div className="flex flex-wrap gap-2 max-h-48 overflow-auto pr-1">
            <button
              onClick={() => set('color', '')}
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm ${!query.color ? 'border-amber-400 bg-amber-50 text-amber-700' : 'border-gray-200 bg-white text-gray-800 hover:bg-gray-50'}`}
            >
              Все цвета
            </button>
            {(facets?.colors || []).map((c: any) => renderColorChip(c.name, c.count))}
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-700">Цена</label>
          <div className="grid grid-cols-2 gap-2">
            <input
              type="number"
              inputMode="numeric"
              min={0}
              placeholder="от"
              defaultValue={query.priceMin || ''}
              onChange={(e)=> set('priceMin', e.target.value)}
              className={`w-full rounded-md border bg-white px-3 py-2 text-sm ${query.priceMin ? 'border-amber-400 ring-2 ring-amber-200' : 'border-gray-200'}`}
            />
            <input
              type="number"
              inputMode="numeric"
              min={0}
              placeholder="до"
              defaultValue={query.priceMax || ''}
              onChange={(e)=> set('priceMax', e.target.value)}
              className={`w-full rounded-md border bg-white px-3 py-2 text-sm ${query.priceMax ? 'border-amber-400 ring-2 ring-amber-200' : 'border-gray-200'}`}
            />
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-700">Сортировка</label>
          <select
            value={query.sort || 'popular'}
            onChange={(e) => set('sort', e.target.value)}
            className={`w-full rounded-md border bg-white px-3 py-2 text-sm ${query.sort && query.sort!=='popular' ? 'border-amber-400 ring-2 ring-amber-200' : 'border-gray-200'}`}
          >
            <option value="popular">Популярность</option>
            <option value="new">Новинки</option>
            <option value="price_asc">Цена ↑</option>
            <option value="price_desc">Цена ↓</option>
            <option value="material_asc">Материал A→Я</option>
            <option value="color_asc">Цвет A→Я</option>
          </select>
        </div>
        <div className="flex items-center justify-between">
          <label htmlFor="instock" className={`text-sm ${query.inStock==='true' ? 'font-semibold text-amber-700' : 'text-gray-700'}`}>В наличии</label>
          <input id="instock" type="checkbox" checked={query.inStock==='true'} onChange={(e)=> set('inStock', e.target.checked ? 'true' : '')} />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-700">На странице</label>
          <select value={query.pageSize || '24'} onChange={(e)=> set('pageSize', e.target.value)} className={`w-full rounded-md border bg-white px-3 py-2 text-sm ${query.pageSize && query.pageSize!=='24' ? 'border-amber-400 ring-2 ring-amber-200' : 'border-gray-200'}`}>
            <option value="12">12</option>
            <option value="24">24</option>
            <option value="48">48</option>
          </select>
        </div>
        {onReset && (
          <button onClick={onReset} className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm hover:bg-gray-50">Сбросить</button>
        )}
      </div>
    )
  }

  return (
  <div className={`mt-2 grid gap-3 ${vertical ? 'grid-cols-1' : 'md:grid-cols-4 lg:grid-cols-7'}`}>
      <div className="md:col-span-2 lg:col-span-2">
        <input
          type="search"
          placeholder="Поиск по каталогу"
          value={qLocal}
          onChange={(e) => setQLocal(e.target.value)}
          className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
        />
      </div>
      <div>
        <select
          value={query.category || ''}
          onChange={(e) => onCategory(e.target.value)}
          className={`w-full rounded-md border bg-white px-3 py-2 text-sm ${query.category ? 'border-amber-400 ring-2 ring-amber-200' : 'border-gray-200'}`}
        >
          <option value="">Все категории</option>
          {catOptions.map((c: any) => (
            <option key={c.slug} value={c.slug}>{c.name || c.slug}{c.count ? ` (${c.count})` : ''}</option>
          ))}
        </select>
      </div>
      {/* Подкатегория удалена по требованию UX */}
      <div>
        <select
          value={query.material || ''}
          onChange={(e) => set('material', e.target.value)}
          className={`w-full rounded-md border bg-white px-3 py-2 text-sm ${query.material ? 'border-amber-400 ring-2 ring-amber-200' : 'border-gray-200'}`}
        >
          <option value="">Все материалы</option>
          {(Array.isArray(facets?.materials) ? facets?.materials : []).map((m: any) => {
            const name = typeof m === 'string' ? m : m.name
            const count = typeof m === 'string' ? undefined : m.count
            return <option key={name} value={name}>{name}{count ? ` (${count})` : ''}</option>
          })}
        </select>
      </div>
      {/* Бренд скрыт по требованию: вкладка не отображается */}
      <div className="col-span-2 lg:col-span-2">
        <div className="flex items-center gap-2 overflow-x-auto whitespace-nowrap py-1">
          <button
            onClick={() => set('color', '')}
            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm ${!query.color ? 'border-amber-400 bg-amber-50 text-amber-700' : 'border-gray-200 bg-white text-gray-800 hover:bg-gray-50'}`}
          >
            Все цвета
          </button>
          {(facets?.colors || []).map((c: any) => renderColorChip(c.name, c.count))}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <input
          type="number"
          inputMode="numeric"
          min={0}
          placeholder="Цена от"
          defaultValue={query.priceMin || ''}
          onChange={(e)=> set('priceMin', e.target.value)}
          className={`w-full rounded-md border bg-white px-3 py-2 text-sm ${query.priceMin ? 'border-amber-400 ring-2 ring-amber-200' : 'border-gray-200'}`}
        />
        <input
          type="number"
          inputMode="numeric"
          min={0}
          placeholder="до"
          defaultValue={query.priceMax || ''}
          onChange={(e)=> set('priceMax', e.target.value)}
          className={`w-full rounded-md border bg-white px-3 py-2 text-sm ${query.priceMax ? 'border-amber-400 ring-2 ring-amber-200' : 'border-gray-200'}`}
        />
      </div>
      <div>
        <select
          value={query.sort || 'popular'}
          onChange={(e) => set('sort', e.target.value)}
          className={`w-full rounded-md border bg-white px-3 py-2 text-sm ${query.sort && query.sort!=='popular' ? 'border-amber-400 ring-2 ring-amber-200' : 'border-gray-200'}`}
        >
          <option value="popular">Популярность</option>
          <option value="new">Новинки</option>
          <option value="price_asc">Цена ↑</option>
          <option value="price_desc">Цена ↓</option>
          <option value="material_asc">Материал A→Я</option>
          <option value="color_asc">Цвет A→Я</option>
        </select>
      </div>
      <div className="flex items-center gap-2">
        <input id="instock" type="checkbox" checked={query.inStock==='true'} onChange={(e)=> set('inStock', e.target.checked ? 'true' : '')} />
        <label htmlFor="instock" className={`text-sm ${query.inStock==='true' ? 'font-semibold text-amber-700' : 'text-gray-700'}`}>В наличии</label>
      </div>
      <div className="flex items-center gap-2">
        <select value={query.pageSize || '24'} onChange={(e)=> set('pageSize', e.target.value)} className={`rounded-md border bg-white px-2 py-2 text-sm ${query.pageSize && query.pageSize!=='24' ? 'border-amber-400 ring-2 ring-amber-200' : 'border-gray-200'}`}>
          <option value="12">12</option>
          <option value="24">24</option>
          <option value="48">48</option>
        </select>
        {onReset && (
          <button onClick={onReset} className="ml-auto rounded-md border border-gray-200 px-3 py-2 text-sm hover:bg-gray-50">Сбросить</button>
        )}
      </div>
    </div>
  )
}

export default memo(FilterBar)
