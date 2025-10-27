#!/usr/bin/env node
// Verify and normalize products.json and local images for Complex-Bar data
// - Validates required fields
// - De-duplicates by slug and title (prefers richer entry)
// - Ensures images exist; repairs missing/corrupted by re-downloading from sourceUrl
// - Normalizes field order { slug, title, price, description, specs, images } (keeps sourceUrl last if present)
// - Writes summary to logs/verify_summary.md and prints short report

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import process from 'process';
import sharp from 'sharp';
import pLimit from 'p-limit';
import { load as cheerioLoad } from 'cheerio';

import 'dotenv/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const PUBLIC_DIR = path.join(ROOT, 'public');
const LOG_DIR = path.join(ROOT, 'logs');

const PRODUCTS_JSON = path.join(DATA_DIR, 'products.json');
const VERIFY_MD = path.join(LOG_DIR, 'verify_summary.md');
const HTTP_TIMEOUT_MS = 12000;
const FETCH_DELAY_MS = 150; // a bit gentler for verification repairs
const PRODUCT_CONCURRENCY = 4;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function absoluteUrl(url, base = 'https://complex-bar.kz') {
  if (!url) return null;
  if (url.startsWith('http')) return url;
  if (url.startsWith('//')) return 'https:' + url;
  if (url.startsWith('/')) return base + url;
  return new URL(url, base).toString();
}

async function fetchText(url, { timeout = HTTP_TIMEOUT_MS } = {}) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const resp = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36' } });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return await resp.text();
  } finally {
    clearTimeout(id);
  }
}

function extractGalleryImages($) {
  // Match scraper logic: focus on gallery containers first
  const containers = [
    '.product-gallery',
    '.swiper-wrapper',
    '.cm-image-gallery',
    '.ty-product-img',
    '.ty-product-images',
    '#product_images',
    '.product-main-image',
  ];
  const seen = new Set();
  const out = [];
  const addUrl = (u) => {
    if (!u) return;
    const abs = absoluteUrl(u);
    if (!abs) return;
    if (/placeholder|no-image|sprite|\.(svg)$/i.test(abs)) return;
    if (/(\/images\/logos\/|(^|\/)logo(\.|-|_|\/))/i.test(abs)) return; // skip site logos
    if (!seen.has(abs)) { seen.add(abs); out.push(abs); }
  };
  let foundAny = false;
  for (const sel of containers) {
    const $c = $(sel);
    if ($c.length === 0) continue;
    foundAny = true;
    $c.find('img, a').each((_, el) => {
      const srcset = $(el).attr('srcset') || '';
      if (srcset) {
        const parts = srcset.split(',').map(s => s.trim().split(' ')[0]).filter(Boolean);
        parts.forEach(addUrl);
      }
      const dataPath = $(el).attr('data-ca-image-path') || $(el).attr('data-large-src') || $(el).attr('data-src') || '';
      addUrl(dataPath);
      const src = $(el).attr('src') || $(el).attr('href') || '';
      addUrl(src);
    });
  }
  if (foundAny) return out;
  $('img, a').each((_, el) => {
    const candidates = [
      $(el).attr('data-ca-image-path'),
      $(el).attr('data-large-src'),
      $(el).attr('data-src'),
      $(el).attr('src'),
      $(el).attr('href'),
      $(el).attr('srcset'),
    ].filter(Boolean);
    for (const c of candidates) {
      const first = String(c).split(',')[0].trim().split(' ')[0];
      if (/(scalesta-cdn\.com|\/images\/detailed\/|\/product\/)\//i.test(first) || /^https?:\/\//i.test(first)) addUrl(first);
    }
  });
  return out;
}

function cleanText(t) { return t?.replace(/\s+/g, ' ').replace(/\u00A0/g, ' ').trim() || ''; }

function extractSpecs($) {
  const specs = {};
  $('table, dl').each((_, cont) => {
    const $c = $(cont);
    $c.find('tr').each((__, tr) => {
      const tds = $(tr).find('td, th');
      if (tds.length >= 2) {
        const key = cleanText($(tds[0]).text());
        const val = cleanText($(tds[1]).text());
        if (key && val && key.length < 80) specs[key] = val;
      }
    });
    $c.find('dt').each((__, dt) => {
      const key = cleanText($(dt).text());
      const val = cleanText($(dt).next('dd').text());
      if (key && val && key.length < 80) specs[key] = val;
    });
  });
  $('[class*="harakter" i], [class*="характер" i]').find('*').each((_, el) => {
    const key = cleanText($(el).find('span, b, strong').first().text());
    let val = '';
    if (key) {
      val = cleanText($(el).clone().children().remove().end().text());
      if (key && val && key.length < 80) specs[key] = val;
    }
  });
  $('[class*="product-feature" i]').each((_, el) => {
    const $el = $(el);
    const key = cleanText($el.find('[class*="name" i]').first().text());
    const val = cleanText($el.find('[class*="value" i]').first().text());
    if (key && val && key.length < 80) specs[key] = val;
  });
  $('li').each((_, li) => {
    const spans = $(li).find('span');
    if (spans.length >= 2) {
      const key = cleanText($(spans[0]).text());
      const val = cleanText($(spans[1]).text());
      if (key && val && key.length < 80) specs[key] = val;
    }
  });
  return specs;
}

async function downloadToWebp(url, outPath) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const img = sharp(buf, { failOnError: false });
    const meta = await img.metadata();
    const w = meta.width || 0;
    const pipeline = w > 0 ? img.resize({ width: Math.min(800, w) }) : img.resize({ width: 800, withoutEnlargement: true });
    const out = await pipeline.webp({ quality: 82 }).toBuffer();
    await fs.mkdir(path.dirname(outPath), { recursive: true });
    await fs.writeFile(outPath, out);
    return true;
  } catch (_) {
    return false;
  } finally {
    clearTimeout(id);
  }
}

async function downloadWithRetries(url, outPath, retries = 3) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ok = await downloadToWebp(url, outPath);
    if (ok) return true;
    await sleep(300);
  }
  return false;
}

function toFsPathFromPublicImage(imgPath) {
  // imgPath examples: 
  //   '/public/products/<slug>/main.webp' => C:\...\public\products\...
  //   '/products/<slug>/main.webp'        => PUBLIC_DIR + products\...
  if (!imgPath) return '';
  const norm = imgPath.replace(/\\/g, '/');
  if (norm.startsWith('/public/')) return path.join(ROOT, norm.slice(1));
  if (norm.startsWith('/products/')) return path.join(PUBLIC_DIR, norm.replace(/^\/products\//, 'products/'));
  return path.join(PUBLIC_DIR, norm); // fallback
}

async function imageExistsAndValid(imgPath) {
  try {
    await fs.access(imgPath);
    // basic integrity: try reading metadata
    await sharp(imgPath).metadata();
    return true;
  } catch (_) {
    return false;
  }
}

function normalizeDescription(desc) {
  if (typeof desc !== 'string') return '';
  const parts = desc.replace(/\s+/g, ' ').trim().split(/(?<=[.!?])\s+/).filter(Boolean);
  if (parts.length <= 4) return parts.join(' ');
  return parts.slice(0, 4).join(' ');
}

async function reconcileImagesWithLive(product) {
  const slug = product.slug;
  const dir = path.join(PUBLIC_DIR, 'products', slug);
  await fs.mkdir(dir, { recursive: true });
  let desiredUrls = [];
  if (product.sourceUrl) {
    try {
      await sleep(FETCH_DELAY_MS);
      const html = await fetchText(product.sourceUrl);
      const $ = cheerioLoad(html);
      desiredUrls = extractGalleryImages($);
    } catch (_) { /* ignore */ }
  }
  // If we couldn't fetch live, fall back to existing local files as the truth
  const localEntries = await fs.readdir(dir).catch(() => []);
  const localWebps = localEntries.filter(n => /\.webp$/i.test(n));
  // Always enforce ONE image max
  const finalNames = [];
  if (desiredUrls.length > 0) {
    const first = desiredUrls[0];
    const outPath = path.join(dir, 'main.webp');
    const ok = await downloadWithRetries(first, outPath, 3);
    if (ok) finalNames.push('main.webp');
    // Remove any other existing webp files
    for (const n of localWebps) {
      if (n !== 'main.webp') {
        try { await fs.unlink(path.join(dir, n)); } catch {}
      }
    }
  } else {
    // No live data available; keep only main.webp if it exists, otherwise pick one and remove the rest
    let keep = localWebps.includes('main.webp') ? 'main.webp' : (localWebps.find(n => /^alt\d+\.webp$/i.test(n)) || localWebps[0]);
    if (keep) finalNames.push(keep);
    for (const n of localWebps) {
      if (n !== keep) {
        try { await fs.unlink(path.join(dir, n)); } catch {}
      }
    }
  }
  // Build public paths
  return finalNames.map(n => '/products/' + slug + '/' + n);
}

function pickBetterEntry(a, b) {
  // Prefer more specs, then more images, then longer description
  const specsA = a?.specs ? Object.keys(a.specs).length : 0;
  const specsB = b?.specs ? Object.keys(b.specs).length : 0;
  if (specsA !== specsB) return specsA > specsB ? a : b;
  const imgsA = Array.isArray(a?.images) ? a.images.length : 0;
  const imgsB = Array.isArray(b?.images) ? b.images.length : 0;
  if (imgsA !== imgsB) return imgsA > imgsB ? a : b;
  const descA = (a?.description || '').length;
  const descB = (b?.description || '').length;
  return descA >= descB ? a : b;
}

function normalizeProductFields(p) {
  const ordered = {
    slug: p.slug || '',
    title: p.title || '',
    price: p.price ?? null,
    description: p.description || '',
    specs: p.specs || {},
    images: Array.isArray(p.images) ? p.images : [],
  };
  if (p.sourceUrl) ordered.sourceUrl = p.sourceUrl;
  return ordered;
}

async function main() {
  const started = new Date();
  await fs.mkdir(LOG_DIR, { recursive: true });
  const raw = await fs.readFile(PRODUCTS_JSON, 'utf8');
  let items = [];
  try { items = JSON.parse(raw); } catch (e) { console.error('JSON parse failed:', e.message); process.exit(1); }

  const seenBySlug = new Map();
  const seenByTitle = new Map();
  let duplicatesRemoved = 0;
  let imagesOk = 0, specsOk = 0;
  let repaired = 0, skipped = 0, changedCounts = 0;

  // De-duplicate, pick best entries
  for (const p of items) {
    const slug = p?.slug || '';
    const titleKey = (p?.title || '').trim().toLowerCase();
    if (!slug && !titleKey) { skipped++; continue; }
    let current = p;
    if (seenBySlug.has(slug)) {
      const prev = seenBySlug.get(slug);
      const best = pickBetterEntry(prev, p);
      if (best !== prev) { seenBySlug.set(slug, best); duplicatesRemoved++; }
    } else {
      seenBySlug.set(slug, current);
    }
    if (titleKey) {
      if (seenByTitle.has(titleKey)) {
        const prev = seenByTitle.get(titleKey);
        const best = pickBetterEntry(prev, p);
        if (best !== prev) { seenByTitle.set(titleKey, best); duplicatesRemoved++; }
      } else {
        seenByTitle.set(titleKey, current);
      }
    }
  }
  // Use slug map as base dataset
  let products = Array.from(seenBySlug.values());

  // Normalize descriptions and validate specs/images; repair images if missing
  const limit = pLimit(PRODUCT_CONCURRENCY);
  await Promise.all(products.map((p, idx) => limit(async () => {
    // Normalize description to 2-4 sentences
    p.description = normalizeDescription(p.description || '');
    // Validate images: reconcile with live gallery for exact count
    const beforeCount = Array.isArray(p.images) ? p.images.length : 0;
    const reconciled = await reconcileImagesWithLive(p);
    p.images = reconciled;
    if (p.images.length > 0) imagesOk++; else skipped++;
    if (p.images.length !== beforeCount) changedCounts++;
    // Validate specs
    let specPairs = Object.entries(p.specs || {}).filter(([k,v]) => !!k && !!v);
    if (specPairs.length < 2 && p.sourceUrl) {
      // attempt repair by fetching page and extracting specs
      try {
        await sleep(FETCH_DELAY_MS);
        const html = await fetchText(p.sourceUrl);
        const $ = cheerioLoad(html);
        const fresh = extractSpecs($);
        const freshPairs = Object.entries(fresh || {}).filter(([k,v]) => !!k && !!v);
        if (freshPairs.length >= 2) {
          // Merge, prefer fresh values
          p.specs = Object.fromEntries(freshPairs);
          specPairs = freshPairs;
        }
      } catch (_) { /* ignore */ }
    }
    if (specPairs.length >= 2) specsOk++; else skipped++;
  })));

  // Reorder fields and filter invalid entries strictly
  products = products
    .map(normalizeProductFields)
    .filter(p => p.slug && p.title && (p.images?.length || 0) >= 1 && Object.keys(p.specs || {}).length >= 2 && (p.description || '').length > 10);

  // Sort alphabetically by title (RU locale)
  products.sort((a, b) => (a.title || '').localeCompare(b.title || '', 'ru'));

  // Write back atomically
  const tmp = PRODUCTS_JSON + '.verify.tmp';
  await fs.writeFile(tmp, JSON.stringify(products, null, 2), 'utf8');
  await fs.rename(tmp, PRODUCTS_JSON);

  const summary = [
    '✅ Validation complete',
    `Total products: ${products.length}`,
    `With images: ${imagesOk}`,
    `With specs: ${specsOk}`,
    `Changed image counts: ${changedCounts}`,
    `Skipped/fixed: ${skipped + repaired}`,
    `Duplicates removed: ${duplicatesRemoved}`,
    `Started: ${started.toISOString()}`,
    `Finished: ${new Date().toISOString()}`,
  ].join('\n');

  await fs.appendFile(VERIFY_MD, `\n\n## Verify summary (${new Date().toISOString()})\n\n${summary}\n`, 'utf8');
  console.log(summary);
}

main().catch(err => { console.error('[verify] Fatal:', err?.message || err); process.exit(1); });
