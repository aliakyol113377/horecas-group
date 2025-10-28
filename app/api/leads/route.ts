import { NextResponse } from 'next/server'
import fs from 'node:fs'
import path from 'node:path'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(req: Request) {
  const body = await req.json()
  const phone: string = body?.phone || ''
  const kind: string = body?.kind || 'contact'
  const cart: any[] = Array.isArray(body?.cart) ? body.cart : []
  const total: number = typeof body?.total === 'number' ? body.total : 0

  const hasCart = cart.length > 0
  // If there's no cart payload, we require a valid phone. If cart present, phone can be omitted.
  if (!hasCart && !/^[+\d\s()-]{8,20}$/.test(phone)) {
    return NextResponse.json({ error: 'Некорректный телефон' }, { status: 400 })
  }
  try {
    // Try DB first, importing prisma lazily to avoid build-time init
    const { prisma } = await import('../../../server/prisma')
    // Create a basic lead when phone is present and valid
    let leadId: string | undefined
    if (phone && /^[+\d\s()-]{8,20}$/.test(phone)) {
      const lead = await prisma.lead.create({ data: { phone, kind } })
      leadId = lead.id
    }

    // Additionally, persist cart snapshot to file when provided
    if (hasCart) {
      const dir = path.join(process.cwd(), 'logs')
      const file = path.join(dir, 'orders.json')
      fs.mkdirSync(dir, { recursive: true })
      let arr: any[] = []
      try { arr = JSON.parse(fs.readFileSync(file, 'utf8')) } catch {}
      const rec = { id: leadId || `file:${Date.now()}`, phone: phone || null, kind, total, cart, createdAt: new Date().toISOString() }
      arr.push(rec)
      fs.writeFileSync(file, JSON.stringify(arr, null, 2), 'utf8')
      return NextResponse.json({ ok: true, id: rec.id })
    }

    return NextResponse.json({ ok: true, id: leadId || null })
  } catch (e) {
    // File fallback when DB is unavailable
    try {
      const dir = path.join(process.cwd(), 'logs')
      const file = path.join(dir, hasCart ? 'orders.json' : 'leads.json')
      fs.mkdirSync(dir, { recursive: true })
      let arr: any[] = []
      try { arr = JSON.parse(fs.readFileSync(file, 'utf8')) } catch {}
      const rec = hasCart
        ? { id: `file:${Date.now()}`, phone: phone || null, kind, total, cart, createdAt: new Date().toISOString() }
        : { id: `file:${Date.now()}`, phone, kind, createdAt: new Date().toISOString() }
      arr.push(rec)
      fs.writeFileSync(file, JSON.stringify(arr, null, 2), 'utf8')
      return NextResponse.json({ ok: true, id: rec.id })
    } catch {
      return NextResponse.json({ error: 'Не удалось сохранить заявку' }, { status: 500 })
    }
  }
}
