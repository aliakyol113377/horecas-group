import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const logDir = path.join(root, 'logs')
const logFile = path.join(logDir, 'final_import_check.log')

function log(line) {
  fs.appendFileSync(logFile, line + '\n')
}

function exists(p) {
  try { fs.accessSync(p); return true } catch { return false }
}

function main() {
  if (!exists(logDir)) fs.mkdirSync(logDir, { recursive: true })
  fs.writeFileSync(logFile, `Final import integrity check — ${new Date().toISOString()}\n`) // reset

  // Check directories
  const imagesDir = path.join(root, 'public', 'imported')
  log(`imagesDir: ${imagesDir} — ${exists(imagesDir) ? 'OK' : 'MISSING'}`)

  // Check products.json
  const dataDir = path.join(root, 'data')
  const productsPath = path.join(dataDir, 'products.json')
  if (!exists(productsPath)) {
    log('products.json: MISSING')
  } else {
    try {
      const raw = fs.readFileSync(productsPath, 'utf8')
      const arr = JSON.parse(raw)
      log(`products.json: OK — ${Array.isArray(arr) ? arr.length : 0} items`)
      const sample = arr.slice(0, Math.min(10, arr.length))
      let imagesOk = 0
      for (const p of sample) {
        // basic shape
        if (!p.slug || !p.name) log(`WARN product shape: ${p.slug || '(no-slug)'} missing name/slug`)
        // images check (local files only)
        const imgs = Array.isArray(p.images) ? p.images : (p.imageUrl ? [p.imageUrl] : [])
        for (const img of imgs) {
          if (typeof img !== 'string') continue
          // Accept URLs; only check local ones under /imported
          if (img.startsWith('/imported/')) {
            const local = path.join(root, 'public', img.replace(/^\//, ''))
            if (exists(local)) imagesOk++
            else log(`WARN missing local image: ${local}`)
          }
        }
      }
      log(`products sample local images found: ${imagesOk}`)
    } catch (e) {
      log('products.json: ERROR parsing — ' + e.message)
    }
  }

  // Check categories.json
  const catsPath = path.join(dataDir, 'categories.json')
  if (!exists(catsPath)) {
    log('categories.json: MISSING (optional)')
  } else {
    try {
      const raw = fs.readFileSync(catsPath, 'utf8')
      const cats = JSON.parse(raw)
      const keys = Object.keys(cats || {})
      log(`categories.json: OK — ${keys.length} top-level categories`)
    } catch (e) {
      log('categories.json: ERROR parsing — ' + e.message)
    }
  }

  log('Check completed.')
}

main()
