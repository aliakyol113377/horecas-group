import fs from 'node:fs'
import path from 'node:path'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export default async function AdminImportsPage() {
  try {
    const { prisma } = await import('../../../../server/prisma')
    const logs = await prisma.importLog.findMany({ orderBy: { createdAt: 'desc' }, take: 50 })
    return (
      <div className="container py-10">
        <h1 className="text-2xl font-bold mb-4">Импорт — последние события</h1>
        <table className="w-full text-sm">
          <thead className="text-white/60">
            <tr><th className="text-left">Дата</th><th className="text-left">URL</th><th>Статус</th><th>Сообщение</th></tr>
          </thead>
          <tbody>
            {logs.map((l: any) => (
              <tr key={l.id} className="border-b border-white/10">
                <td className="py-2 pr-4 whitespace-nowrap">{new Date(l.createdAt).toLocaleString('ru-RU')}</td>
                <td className="py-2 pr-4 truncate max-w-[480px]"><a className="text-brand-gold hover:underline" href={l.url} target="_blank">{l.url}</a></td>
                <td className="py-2 pr-4 text-center">{l.status}</td>
                <td className="py-2 pr-4 text-white/70">{l.message || ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  } catch (e:any) {
    // Fallback: list recent log files
    let files: { name: string; size: number; mtime: string }[] = []
    try {
      const dir = path.join(process.cwd(), 'logs')
      const list = fs.readdirSync(dir)
      files = list
        .filter((n) => n.startsWith('import_run_'))
        .map((n) => {
          const st = fs.statSync(path.join(dir, n))
          return { name: n, size: st.size, mtime: st.mtime.toISOString() }
        })
        .sort((a, b) => b.mtime.localeCompare(a.mtime))
        .slice(0, 20)
    } catch {}
    return (
      <div className="container py-10">
        <h1 className="text-2xl font-bold mb-2">Импорт — последние события</h1>
        <p className="text-red-400">Блокер БД: {e?.message}</p>
        <p className="text-white/70 mt-2">Показываем локальные файлы логов (если есть):</p>
        <ul className="mt-4 space-y-2">
          {files.map((f) => (
            <li key={f.name} className="flex items-center justify-between border-b border-white/10 py-1">
              <span className="font-mono">{f.name}</span>
              <span className="text-white/60">{(f.size/1024).toFixed(1)} KB · {new Date(f.mtime).toLocaleString('ru-RU')}</span>
            </li>
          ))}
          {!files.length && <li className="text-white/60">Логи не найдены</li>}
        </ul>
      </div>
    )
  }
}
