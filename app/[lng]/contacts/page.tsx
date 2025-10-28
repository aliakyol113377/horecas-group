"use client"

export const dynamic = 'force-dynamic'

import { useState } from 'react'

export default function ContactsPage() {
  const [phone, setPhone] = useState('')
  const [status, setStatus] = useState<'idle'|'loading'|'success'|'error'>('idle')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setStatus('loading')
    try {
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, kind: 'contact' })
      })
      if (!res.ok) throw new Error('failed')
      setStatus('success')
      setPhone('')
    } catch (e) {
      setStatus('error')
    }
  }

  return (
    <div className="container py-12 grid gap-10 md:grid-cols-2">
      <div>
        <h1 className="mb-2 text-3xl font-bold">Контакты</h1>
        <p className="mb-6 text-gray-600">Оставьте номер телефона — мы перезвоним и ответим на все вопросы.</p>

        <div className="mb-6 rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
          <div className="space-y-2 text-sm text-gray-700">
            <div><span className="font-semibold">Адрес:</span> ул. Толеби 187, ТД "Тумар", 2 этаж, Алматы, Казахстан</div>
            <div><span className="font-semibold">Телефон:</span> <a className="text-amber-600" href="tel:+77763118110">+7 776 311 8110</a></div>
            <div><span className="font-semibold">Email:</span> <a className="text-amber-600" href="mailto:horecasgroup@gmail.com">horecasgroup@gmail.com</a></div>
            <div>
              <a href="https://wa.me/77763118110?text=%D0%97%D0%B4%D1%80%D0%B0%D0%B2%D1%81%D1%82%D0%B2%D1%83%D0%B9%D1%82%D0%B5!%20%D0%A5%D0%BE%D1%87%D1%83%20%D0%BF%D0%BE%D0%BB%D1%83%D1%87%D0%B8%D1%82%D1%8C%20%D0%BA%D0%BE%D0%BD%D1%81%D1%83%D0%BB%D1%8C%D1%82%D0%B0%D1%86%D0%B8%D1%8E" target="_blank" rel="noopener noreferrer" className="inline-flex items-center rounded-md bg-green-600 text-white px-3 py-1.5 hover:bg-green-700">Написать в WhatsApp</a>
            </div>
            <div className="flex gap-4 pt-2" />
          </div>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <input
            type="tel"
            required
            placeholder="Ваш телефон"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full rounded-md border border-gray-200 bg-white px-4 py-3 outline-none focus:ring-2 focus:ring-amber-500"
          />
          <button disabled={status==='loading'} className="btn-primary w-full">Перезвонить мне</button>
          {status==='success' && <p className="text-green-600">Заявка отправлена. Мы перезвоним!</p>}
          {status==='error' && <p className="text-red-600">Ошибка. Попробуйте позже.</p>}
        </form>
      </div>
      <div>
        <iframe
          title="map"
          className="w-full aspect-video rounded-xl border border-gray-100"
          src="https://yandex.com/map-widget/v1/?text=%D1%83%D0%BB.%20%D0%A2%D0%BE%D0%BB%D0%B5%D0%B1%D0%B8%20187%20%D0%A2%D0%94%20%22%D0%A2%D1%83%D0%BC%D0%B0%D1%80%22%202%20%D1%8D%D1%82%D0%B0%D0%B6%2C%20%D0%90%D0%BB%D0%BC%D0%B0%D1%82%D1%8B%2C%20%D0%9A%D0%B0%D0%B7%D0%B0%D1%85%D1%81%D1%82%D0%B0%D0%BD&z=16"
          allowFullScreen
        />
      </div>
    </div>
  )
}
