"use client"
import { memo, useEffect, useRef, useState } from 'react'

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
          <select
            value={query.color || ''}
            onChange={(e) => set('color', e.target.value)}
            className={`w-full rounded-md border bg-white px-3 py-2 text-sm ${query.color ? 'border-amber-400 ring-2 ring-amber-200' : 'border-gray-200'}`}
          >
            <option value="">Все цвета</option>
            {facets?.colors?.map((c) => (
              <option key={c.name} value={c.name}>{c.name}{c.count ? ` (${c.count})` : ''}</option>
            ))}
          </select>
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
      <div>
        <select
          value={query.color || ''}
          onChange={(e) => set('color', e.target.value)}
          className={`w-full rounded-md border bg-white px-3 py-2 text-sm ${query.color ? 'border-amber-400 ring-2 ring-amber-200' : 'border-gray-200'}`}
        >
          <option value="">Все цвета</option>
          {facets?.colors?.map((c) => (
            <option key={c.name} value={c.name}>{c.name}{c.count ? ` (${c.count})` : ''}</option>
          ))}
        </select>
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
