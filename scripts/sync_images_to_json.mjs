#!/usr/bin/env node
// Sync products.json image arrays to match exactly the .webp files present in /public/products/<slug>/
// - No network and no sharp required
// - Skips any files that look like logos (logo.* or /images/logos/ pattern in source paths not applicable here)
// - Orders files as: main.webp, then alt1.webp..altN.webp

import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT = path.resolve(__dirname, '..')
const DATA = path.join(ROOT, 'data', 'products.json')
const PUBLIC_DIR = path.join(ROOT, 'public')

function normalize(p) { return p.replace(/\\/g, '/') }

async function main() {
  const raw = await fs.readFile(DATA, 'utf8')
  let products = []
  try { products = JSON.parse(raw) } catch (e) {
    console.error('Failed to parse products.json:', e.message)
    process.exit(1)
  }

  let updated = 0, skipped = 0
  for (const p of products) {
    const slug = p?.slug
    if (!slug) { skipped++; continue }
    const dir = path.join(PUBLIC_DIR, 'products', slug)
    let entries = []
    try { entries = await fs.readdir(dir) } catch { skipped++; continue }
    const webps = entries.filter(n => /\.webp$/i.test(n))
    if (webps.length === 0) { skipped++; continue }
    // Keep only ONE image per product. Prefer main.webp, otherwise pick the first alt or any .webp
    let keep = 'main.webp'
    if (!webps.includes('main.webp')) {
      const firstAlt = webps.find(n => /^alt\d+\.webp$/i.test(n))
      keep = firstAlt || webps[0]
    }
    // Optionally delete extras to enforce a single image on disk
    for (const n of webps) {
      if (n !== keep) {
        try { await fs.unlink(path.join(dir, n)) } catch {}
      }
    }
    const pubPaths = ['/products/' + slug + '/' + keep]
    const before = Array.isArray(p.images) ? p.images.join('|') : ''
    const after = pubPaths.join('|')
    if (before !== after) {
      p.images = pubPaths
      updated++
    }
  }

  if (updated > 0) {
    await fs.writeFile(DATA, JSON.stringify(products, null, 2), 'utf8')
  }
  console.log(`Synced images. Updated products: ${updated}; Skipped: ${skipped}`)
}

main().catch(e => { console.error('sync failed:', e?.message || e); process.exit(1) })
