"use client"

import Image from 'next/image'
import Link from 'next/link'
import { useCart } from '../../../lib/cart'
import { formatKZT } from '../../../lib/format'

export default function CartPage() {
  const { items, total, setQty, remove, clear } = useCart()
  const handleCheckout = async () => {
    // Prepare cart snapshot for backend and message
    const cart = items.map(it => ({ slug: it.slug, name: it.name, qty: it.qty, price: it.price }))
    // Fire-and-forget: send cart snapshot so we receive composition
    try {
      await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'cart', cart, total })
      })
    } catch {}

    // Build WhatsApp message so user can instantly write to us
    const lines: string[] = []
    lines.push('Здравствуйте! Хочу оформить заказ.')
    if (typeof window !== 'undefined') {
      try { lines.push(`Сайт: ${window.location.origin}`) } catch {}
    }
    lines.push('')
    lines.push('Состав корзины:')
    items.forEach(it => {
      const sum = typeof it.price === 'number' ? (it.price || 0) * it.qty : null
      lines.push(`- ${it.name} × ${it.qty}${sum ? ` — ${formatKZT(sum)}` : ''}`)
    })
    lines.push(`Итого: ${formatKZT(total)}`)
    const text = lines.join('\n')
    const waUrl = `https://wa.me/77763118110?text=${encodeURIComponent(text)}`
    if (typeof window !== 'undefined') window.open(waUrl, '_blank')
  }
  return (
    <div className="container py-12">
      <h1 className="text-3xl font-bold mb-6">Корзина</h1>
      {items.length === 0 ? (
        <div className="card p-8 text-center">
          <p className="text-gray-600">Ваша корзина пуста</p>
          <Link href="../catalog" className="btn-primary mt-4 inline-flex">Перейти в каталог</Link>
        </div>
      ) : (
        <div className="grid md:grid-cols-3 gap-6">
          <div className="md:col-span-2 space-y-3">
            {items.map((it) => (
              <div key={it.slug} className="card p-4 flex items-center gap-4">
                <div className="relative w-20 h-20 bg-gray-100 rounded-md overflow-hidden">
                  {it.imageUrl ? <Image src={it.imageUrl} alt={it.name} fill className="object-cover"/> : null}
                </div>
                <div className="flex-1">
                  <div className="font-medium">{it.name}</div>
                  <div className="text-sm text-gray-500">{it.price ? formatKZT(it.price) : 'Цена по запросу'}</div>
                </div>
                <div className="flex items-center gap-2">
                  <input type="number" min={1} value={it.qty} onChange={(e) => setQty(it.slug, Math.max(1, Number(e.target.value)||1))} className="w-16 rounded-md border border-gray-200 px-2 py-1"/>
                  <button onClick={() => remove(it.slug)} className="text-red-600 hover:text-red-700">Удалить</button>
                </div>
              </div>
            ))}
          </div>
          <aside className="card p-6 h-fit sticky top-24">
            <div className="flex items-center justify-between mb-2"><span className="text-gray-600">Итого:</span><span className="text-xl font-bold">{formatKZT(total)}</span></div>
            <button onClick={handleCheckout} className="btn-primary w-full">Оформить заказ</button>
            <button onClick={clear} className="mt-2 w-full rounded-md border border-gray-200 py-2 hover:bg-gray-50">Очистить корзину</button>
          </aside>
        </div>
      )}
    </div>
  )
}
