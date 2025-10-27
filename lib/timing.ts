import fs from 'node:fs'
import path from 'node:path'

const LOG_PATH = path.join(process.cwd(), 'logs', 'performance_fix.log')
const SLOW_LOG_PATH = path.join(process.cwd(), 'logs', 'perf_slow.log')

function ensureLogDir() {
  try { fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true }) } catch {}
  try { fs.mkdirSync(path.dirname(SLOW_LOG_PATH), { recursive: true }) } catch {}
}

export function markStart() {
  return performance.now()
}

export function logIfSlow(label: string, start: number, thresholdMs = 500, extra?: Record<string, any>) {
  const dur = performance.now() - start
  if (dur >= thresholdMs) {
    ensureLogDir()
    const entry = {
      ts: new Date().toISOString(),
      label,
      ms: Math.round(dur),
      ...(extra || {})
    }
    try {
      fs.appendFileSync(LOG_PATH, JSON.stringify(entry) + '\n')
      fs.appendFileSync(SLOW_LOG_PATH, JSON.stringify(entry) + '\n')
    } catch {}
  }
}

export async function timeAsync(label: string, fn: () => Promise<any>, thresholdMs = 500, extra?: Record<string, any>) {
  const start = markStart()
  try {
    const res = await fn()
    logIfSlow(label, start, thresholdMs, extra)
    return res
  } catch (e) {
    logIfSlow(label + ':error', start, thresholdMs, { ...(extra || {}), error: (e as Error)?.message })
    throw e
  }
}
