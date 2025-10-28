"use client"
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import ProductCard from '../../components/ProductCard'

export const dynamic = 'force-dynamic'

export default function HomePage() {
  const pathname = usePathname()
  const lng = pathname?.split('/').filter(Boolean)[0] || 'ru'
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState<any[]>([])
  const categories: { label: string; slug: string }[] = [
    { label: 'Тарелки', slug: 'blyuda-tarelki' },
    { label: 'Стаканы', slug: 'stakany' },
    { label: 'Кружки', slug: 'kruzhki' },
    { label: 'Столовые приборы', slug: 'stolovye-pribory' },
    { label: 'Бокалы', slug: 'bokaly' },
    { label: 'Аксессуары', slug: 'vspomogatelnyy-inventar' }
  ]
  const [selected, setSelected] = useState<string>('')

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const base = `/api/products?pageSize=8&sort=popular`
        const url = selected ? `${base}&category=${encodeURIComponent(selected)}` : base
        const res = await fetch(url, { cache: 'no-store' })
        const data = await res.json()
        if (!cancelled) {
          setItems(Array.isArray(data?.items) ? data.items : [])
        }
      } catch (e) {
        if (!cancelled) setItems([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    setLoading(true); load()
    return () => { cancelled = true }
  }, [selected])

  return (
    <div className="container py-12">
      <section className="text-center space-y-6">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="rounded-2xl border border-gray-100 bg-gradient-to-br from-amber-500/[0.06] via-rose-500/[0.05] to-transparent p-8">
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-gray-900">
            Horecas Group — посуда и инвентарь для HoReCa
          </h1>
          <p className="mt-4 text-lg text-gray-900 max-w-3xl mx-auto">
            качественные товары, быстрые ответы. Доставляем по Казахстану и помогаем подобрать оптимальные решения для ваших нужд.
          </p>
          <div className="mt-6 flex items-center justify-center gap-4">
            <Link className="btn-primary" href={`/${lng}/catalog`}>Перейти в каталог</Link>
            <Link className="inline-flex items-center justify-center rounded-md border border-gray-300 text-gray-900 px-5 py-3 hover:bg-gray-50 transition" href={`/${lng}/about`}>О компании</Link>
          </div>
        </motion.div>
      </section>

      {/* Быстрые ориентиры по категориям */}
      <section className="mt-10 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {categories.map((cat) => (
          <button
            key={cat.slug}
            onClick={() => setSelected(cat.slug === selected ? '' : cat.slug)}
            className={`rounded-lg border p-4 text-center font-medium transition ${selected===cat.slug ? 'border-amber-400 bg-white/20' : 'border-white/10 bg-white/5 hover:bg-white/10'}`}
          >
            {cat.label}
          </button>
        ))}
      </section>

      {/* Подборка товаров на главной */}
      <section className="mt-12">
        <div className="mb-4 flex items-end justify-between">
          <h2 className="text-2xl font-bold">{selected ? categories.find(c=>c.slug===selected)?.label : 'Популярные товары'}</h2>
          <Link className="text-amber-500 hover:text-amber-400 text-sm" href={selected ? `/${lng}/catalog?category=${encodeURIComponent(selected)}` : `/${lng}/catalog`}>Смотреть все</Link>
        </div>
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="rounded-xl border border-white/10 bg-white/5 p-3 animate-pulse h-64" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {items.map((p) => (
              <ProductCard key={p.id || p.slug} product={p} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
