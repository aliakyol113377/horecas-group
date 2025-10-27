"use client"

import { useEffect, useState, Suspense, type ComponentType } from 'react'
import { motion } from 'framer-motion'
import dynamic from 'next/dynamic'
const ProductCard = dynamic(() => import('../../../components/ProductCard'), { ssr: false }) as unknown as ComponentType<{ product: any }>
const FilterBar = dynamic(() => import('../../../components/FilterBar'), { ssr: false }) as unknown as ComponentType<{ query: Record<string, string>; onChange: (q: Record<string, string>) => void; onReset?: () => void; facets?: any; vertical?: boolean }>
import SkeletonGrid from '../../../components/SkeletonGrid'

const defaults = { page: '1', pageSize: '24', sort: 'popular', action: '' }

export default function CatalogClient() {
  const [items, setItems] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState<Record<string, string>>(defaults)
  const [facets, setFacets] = useState<any>(null)
  const [showFilters, setShowFilters] = useState(false)

  // Initialize from URL
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search)
    const q: Record<string, string> = { ...defaults }
    sp.forEach((v, k) => { if (v) q[k] = v })
    setQuery(q)
  }, [])

  // Fetch when query changes
  useEffect(() => {
    setLoading(true)
    const params = new URLSearchParams({ ...query })
    const action = params.get('action') || ''
    if (action) params.delete('action')
    // Update URL (replaceState)
    const url = `${window.location.pathname}?${params.toString()}`
    window.history.replaceState(null, '', url)

    fetch(`/api/products?${params.toString()}`)
      .then((r) => r.json())
      .then((data) => {
        if (action === 'append') {
          setItems((prev) => [...prev, ...(data.items || [])])
          setTotal(data.total || 0)
        } else {
          setItems(data.items || [])
          setTotal(data.total || 0)
        }
      })
      .finally(() => setLoading(false))
  }, [JSON.stringify(query)])

  // Load facets once
  useEffect(() => {
    fetch('/api/facets').then((r) => r.json()).then(setFacets).catch(() => setFacets(null))
  }, [])

  const onFilterChange = (next: Record<string, string>) => setQuery((q) => ({ ...q, ...next, page: '1', action: '' }))
  const onReset = () => setQuery({ ...defaults })

  const page = Number(query.page || '1')
  const pageSize = Number(query.pageSize || '24')
  const pageCount = Math.max(1, Math.ceil(total / pageSize))

  return (
    <div className="container py-10">
      <motion.h1 initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="text-3xl font-bold">Каталог</motion.h1>
      {/* Mobile filters toggle */}
      <div className="mt-4 flex items-center justify-between lg:hidden">
        <div className="text-sm text-gray-300">Найдено {total} товаров</div>
        <button
          onClick={() => setShowFilters(true)}
          className="inline-flex items-center rounded-md bg-white/10 px-3 py-2 text-sm text-white hover:bg-white/15"
          aria-label="Открыть фильтры"
        >
          Фильтры
        </button>
      </div>
      <div className="mt-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Sidebar filters on the left */}
        <aside className="hidden lg:block lg:col-span-3 self-start lg:sticky lg:top-24">
          <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
            <div className="mb-3">
              <h2 className="text-lg font-semibold">Фильтры</h2>
            </div>
            <FilterBar vertical query={query} onChange={onFilterChange} onReset={onReset} facets={facets || undefined} />
          </div>
        </aside>
        {/* Products on the right */}
        <main className="lg:col-span-9">
          {!loading && (
            <div className="mb-3 text-sm text-gray-600">Найдено {total} товаров</div>
          )}
          <Suspense fallback={<SkeletonGrid /> }>
            {loading ? (
              <SkeletonGrid />
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
                {items.map((p) => (
                  <motion.div key={p.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                    <ProductCard product={p} />
                  </motion.div>
                ))}
              </div>
            )}
          </Suspense>
          {!loading && items.length === 0 && <div className="mt-6 text-white/60">Ничего не найдено</div>}
          {!loading && items.length > 0 && (
            <div className="mt-8 flex items-center justify-center gap-3">
              {page < pageCount && (
                <button
                  onClick={() => setQuery((q) => ({ ...q, page: String(page + 1), action: 'append' }))}
                  className="rounded-md bg-amber-600 text-white px-4 py-2 text-sm hover:bg-amber-700 disabled:opacity-50"
                >
                  Показать ещё
                </button>
              )}
              <div className="text-sm text-gray-600">Страница {page} из {pageCount}</div>
            </div>
          )}
        </main>
      </div>

      {/* Mobile filters drawer */}
      {showFilters && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/70" onClick={() => setShowFilters(false)} />
          <div className="absolute inset-x-0 bottom-0 max-h-[80vh] rounded-t-2xl bg-white p-4 shadow-2xl">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Фильтры</h2>
              <button onClick={() => setShowFilters(false)} className="text-sm text-gray-600 hover:text-gray-800">Закрыть</button>
            </div>
            <div className="overflow-y-auto pr-1" style={{ maxHeight: '60vh' }}>
              <FilterBar vertical query={query} onChange={onFilterChange} onReset={onReset} facets={facets || undefined} />
            </div>
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => setShowFilters(false)}
                className="flex-1 rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700"
              >
                Показать товары
              </button>
              <button
                onClick={() => { onReset(); setShowFilters(false) }}
                className="rounded-md border border-gray-200 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                Сбросить
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
