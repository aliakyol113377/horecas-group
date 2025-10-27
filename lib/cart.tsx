"use client"

import { createContext, useContext, useEffect, useMemo, useState } from 'react'

type CartItem = { slug: string; name: string; price: number | null; imageUrl?: string | null; qty: number }

type CartContextType = {
  items: CartItem[]
  count: number
  total: number
  add: (item: Omit<CartItem, 'qty'>, qty?: number) => void
  remove: (slug: string) => void
  clear: () => void
  setQty: (slug: string, qty: number) => void
}

const CartContext = createContext<CartContextType | null>(null)

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([])
  const [toastAt, setToastAt] = useState<number>(0)
  const [toastVisible, setToastVisible] = useState(false)

  useEffect(() => {
    try {
      const raw = localStorage.getItem('cart')
      if (raw) setItems(JSON.parse(raw))
    } catch {}
  }, [])

  useEffect(() => {
    try { localStorage.setItem('cart', JSON.stringify(items)) } catch {}
  }, [items])

  const api = useMemo(() => ({
    items,
    count: items.reduce((s, it) => s + it.qty, 0),
    total: items.reduce((s, it) => s + (it.price || 0) * it.qty, 0),
    add: (item: Omit<CartItem, 'qty'>, qty = 1) => {
      setItems((arr) => {
        const idx = arr.findIndex((x) => x.slug === item.slug)
        if (idx >= 0) {
          const next = arr.slice(); next[idx] = { ...arr[idx], qty: arr[idx].qty + qty }; return next
        }
        return [...arr, { ...item, qty }]
      })
      // show mini-cart toast
      setToastAt(Date.now())
      setToastVisible(true)
    },
    remove: (slug: string) => setItems((arr) => arr.filter((x) => x.slug !== slug)),
    clear: () => setItems([]),
    setQty: (slug: string, qty: number) => setItems((arr) => arr.map((x) => x.slug === slug ? { ...x, qty } : x))
  }), [items])

  // Auto-hide toast after 3.5s
  useEffect(() => {
    if (!toastVisible) return
    const id = setTimeout(() => setToastVisible(false), 3500)
    return () => clearTimeout(id)
  }, [toastAt, toastVisible])

  return (
    <CartContext.Provider value={api}>
      {children}
      {toastVisible && (
        <MiniCartToast items={items} total={api.total} onClose={() => setToastVisible(false)} />
      )}
    </CartContext.Provider>
  )
}

export function useCart() {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error('useCart must be used within CartProvider')
  return ctx
}

function MiniCartToast({ items, total, onClose }: { items: CartItem[]; total: number; onClose: () => void }) {
  // Determine current locale to build cart URL
  const lng = typeof window !== 'undefined' ? (window.location.pathname.split('/').filter(Boolean)[0] || 'ru') : 'ru'
  const cartUrl = `/${lng}/cart`
  const topItems = items.slice(-3).reverse() // show last added first, up to 3
  return (
    <div className="fixed bottom-4 right-4 z-[60] w-[92vw] max-w-sm rounded-lg border border-gray-200 bg-white shadow-xl">
      <div className="p-4">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-sm font-semibold">Товар добавлен в корзину</div>
          <button onClick={onClose} aria-label="Закрыть" className="text-gray-400 hover:text-gray-600">✕</button>
        </div>
        <ul className="mb-3 max-h-32 overflow-auto text-sm text-gray-700 list-disc pl-5">
          {topItems.map((it) => (
            <li key={it.slug}>{it.name} × {it.qty}{typeof it.price === 'number' && it.price>0 ? ` — ${((it.price||0)*it.qty).toLocaleString('ru-RU')} ₸` : ''}</li>
          ))}
          {items.length > topItems.length && (
            <li className="text-gray-500">ещё {items.length - topItems.length} товар(ов)…</li>
          )}
        </ul>
        <div className="mb-3 flex items-center justify-between text-sm">
          <span className="text-gray-600">Итого:</span>
          <span className="text-lg font-bold text-amber-600">{total.toLocaleString('ru-RU')} ₸</span>
        </div>
        <div className="flex gap-2">
          <a href={cartUrl} className="btn-primary flex-1 text-center">Оформить заказ</a>
          <button onClick={onClose} className="rounded-md border border-gray-200 px-3 py-2 text-sm hover:bg-gray-50">Продолжить</button>
        </div>
      </div>
    </div>
  )
}
