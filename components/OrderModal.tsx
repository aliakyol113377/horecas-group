"use client"
import { useState } from 'react'

export default function OrderModal({ product }: { product: { slug: string; name: string } }) {
  const [open, setOpen] = useState(false)
  const [phone, setPhone] = useState('')
  const [status, setStatus] = useState<'idle'|'sending'|'ok'|'err'>('idle')

  async function submit() {
    if (!phone.trim()) return
    setStatus('sending')
    try {
      const res = await fetch('/api/leads', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ phone, note: `Заявка с карточки: ${product.slug} - ${product.name}` }) })
      if (!res.ok) throw new Error('bad')
      setStatus('ok')
    } catch {
      setStatus('err')
    }
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="btn-secondary ml-3">Заказать</button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl">
            <div className="flex items-center justify-between">
              <div className="font-semibold">Быстрый заказ</div>
              <button onClick={() => { setOpen(false); setStatus('idle') }} className="text-gray-500 hover:text-gray-900">✕</button>
            </div>
            <div className="mt-3 text-sm text-gray-600">Оставьте номер телефона – мы перезвоним.</div>
            <input
              type="tel"
              placeholder="Номер телефона"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="mt-4 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
            />
            <button onClick={submit} disabled={status==='sending'} className="mt-4 w-full rounded-md bg-amber-600 text-white px-4 py-2 text-sm hover:bg-amber-700 disabled:opacity-50">
              {status==='sending' ? 'Отправка…' : 'Отправить'}
            </button>
            {status==='ok' && <div className="mt-3 text-green-700 text-sm">Спасибо! Мы свяжемся с вами.</div>}
            {status==='err' && <div className="mt-3 text-red-600 text-sm">Не удалось отправить. Попробуйте позже.</div>}
          </div>
        </div>
      )}
    </>
  )
}
