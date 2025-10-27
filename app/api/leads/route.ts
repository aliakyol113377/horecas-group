import { NextResponse } from 'next/server'
import { prisma } from '../../../server/prisma'
import fs from 'node:fs'
import path from 'node:path'

export async function POST(req: Request) {
  const body = await req.json()
  const phone: string = body?.phone || ''
  const kind: string = body?.kind || 'contact'
  if (!/^[+\d\s()-]{8,20}$/.test(phone)) {
    return NextResponse.json({ error: 'Некорректный телефон' }, { status: 400 })
  }
  try {
    const lead = await prisma.lead.create({ data: { phone, kind } })
    return NextResponse.json({ ok: true, id: lead.id })
  } catch (e) {
    // File fallback when DB is unavailable
    try {
      const dir = path.join(process.cwd(), 'logs')
      const file = path.join(dir, 'leads.json')
      fs.mkdirSync(dir, { recursive: true })
      let arr: any[] = []
      try { arr = JSON.parse(fs.readFileSync(file, 'utf8')) } catch {}
      const rec = { id: `file:${Date.now()}`, phone, kind, createdAt: new Date().toISOString() }
      arr.push(rec)
      fs.writeFileSync(file, JSON.stringify(arr, null, 2), 'utf8')
      return NextResponse.json({ ok: true, id: rec.id })
    } catch {
      return NextResponse.json({ error: 'Не удалось сохранить заявку' }, { status: 500 })
    }
  }
}
