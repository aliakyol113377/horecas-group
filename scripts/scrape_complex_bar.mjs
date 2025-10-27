#!/usr/bin/env node
// Scrape Complex-Bar.kz category: Столовая посуда
// - Follows subcategories (Категория block) and pagination
// - Extracts title, description, specs, price, image URLs
// - Downloads images and converts to WebP (max width 800px)
// - Appends products to data/products.json (dedup by slug)

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import process from 'process';
import { load as cheerioLoad } from 'cheerio';
import pLimit from 'p-limit';
import slugify from 'slugify';
import sharp from 'sharp';

import 'dotenv/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const PUBLIC_DIR = path.join(ROOT, 'public');
const LOG_DIR = path.join(ROOT, 'logs');

const START_URL = 'https://complex-bar.kz/catalog/stolovaya-posuda/';

const HTTP_TIMEOUT_MS = 12000;
const LISTING_CONCURRENCY = 2;
const PRODUCT_CONCURRENCY = 4;
const FETCH_DELAY_MS = 200; // polite throttle between requests
const MAX_PRODUCTS = (() => {
  const arg = process.argv.find(s => s.startsWith('--max='));
  if (arg) return Number(arg.slice(6)) || 0;
  return Number(process.env.SCRAPE_MAX_PRODUCTS || 0);
})(); // 0 = unlimited
const SUBCATEGORY_URL = (() => {
  const arg = process.argv.find(s => s.startsWith('--subcategory='));
  if (!arg) return '';
  const url = arg.slice('--subcategory='.length);
  return url || '';
})();

// Flags to control behavior
const NO_DOWNLOAD = process.argv.includes('--no-download');
const APPEND_ONLY = process.argv.includes('--append-only');

const PRODUCTS_JSON = path.join(DATA_DIR, 'products.json');
const SUMMARY_MD = path.join(LOG_DIR, 'fill_summary.md');
const RUN_LOG = path.join(LOG_DIR, 'scrape_run.txt');

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchText(url, { timeout = HTTP_TIMEOUT_MS } = {}) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const resp = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36' } });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const text = await resp.text();
    return text;
  } finally {
    clearTimeout(id);
  }
}

function normSlug(title) {
  return slugify(title, { lower: true, strict: true, locale: 'ru' }).replace(/-+/g, '-');
}

function parsePriceToNumber(txt) {
  if (!txt) return null;
  const m = txt.replace(/[\s\u00A0]/g, '').match(/(\d+[\d]*)/);
  if (!m) return null;
  return Number(m[1]);
}

function cleanText(t) {
  return t?.replace(/\s+/g, ' ').replace(/\u00A0/g, ' ').trim() || '';
}

function splitSentences(text) {
  // Keep 2-4 sentences max for readability; don't invent content
  const parts = text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .filter(Boolean);
  if (parts.length <= 4) return parts.join(' ');
  return parts.slice(0, 4).join(' ');
}

function absoluteUrl(url, base = 'https://complex-bar.kz') {
  if (!url) return null;
  if (url.startsWith('http')) return url;
  if (url.startsWith('//')) return 'https:' + url;
  if (url.startsWith('/')) return base + url;
  return new URL(url, base).toString();
}

function extractListingProductLinks($, baseUrl) {
  const set = new Set();
  $('a[href*="/product/"]').each((_, a) => {
    const href = $(a).attr('href');
    if (!href) return;
    const u = absoluteUrl(href, baseUrl);
    if (u.includes('/product/')) set.add(u.split('?')[0]);
  });
  return Array.from(set);
}

function extractPaginationUrls($, baseUrl) {
  const urls = new Set();
  $('a[href*="PAGEN_1="]').each((_, a) => {
    const href = $(a).attr('href');
    if (!href) return;
    const u = absoluteUrl(href, baseUrl);
    urls.add(u);
  });
  // Deduce numeric pages from pager
  return Array.from(urls);
}

function extractSubcategoryLinks($, baseUrl) {
  // Try to find block titled "Категория"; fallback to any /catalog/ links within the page body
  const links = new Set();
  $('a[href*="/catalog/"]').each((_, a) => {
    const href = $(a).attr('href');
    if (!href) return;
    // Only keep subcategory links under the main category and avoid obvious brand/filters when possible
    if (href.includes('/product/')) return;
    if (href.includes('/brands') || href.includes('/brand-')) return;
    const u = absoluteUrl(href, baseUrl);
    // Keep only category pages (end with slash) and ensure they are under the root category path
    if (/\/catalog\/.+\/$/.test(u) && u.startsWith(START_URL)) links.add(u);
  });
  return Array.from(links);
}

function extractGalleryImages($) {
  // Collect images only from known gallery containers to avoid layout assets
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
    // Skip sprites/placeholders, keep real product images
    if (/placeholder|no-image|sprite|\.(svg)$/i.test(abs)) return;
    // Explicitly skip any site logos
    if (/(\/images\/logos\/|(^|\/)logo(\.|-|_|\/))/i.test(abs)) return;
    if (!seen.has(abs)) { seen.add(abs); out.push(abs); }
  };
  // Look inside containers first
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
  // Fallback: scan whole document but restrict to likely product CDN patterns
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
      if (!c) continue;
      const first = String(c).split(',')[0].trim().split(' ')[0];
      if (/(scalesta-cdn\.com|\/images\/detailed\/|\/product\/)\//i.test(first) || /^https?:\/\//i.test(first)) {
        addUrl(first);
      }
    }
  });
  return out;
}

function extractSpecs($) {
  const specs = {};
  // Try to parse characteristics table: look for dt/dd or table rows
  // CS-Cart often uses .ty-product-feature or definition lists
  $('table, dl').each((_, cont) => {
    const $c = $(cont);
    // rows
    $c.find('tr').each((__, tr) => {
      const tds = $(tr).find('td, th');
      if (tds.length >= 2) {
        const key = cleanText($(tds[0]).text());
        const val = cleanText($(tds[1]).text());
        if (key && val && key.length < 80) specs[key] = val;
      }
    });
    // dl lists
    $c.find('dt').each((__, dt) => {
      const key = cleanText($(dt).text());
      const val = cleanText($(dt).next('dd').text());
      if (key && val && key.length < 80) specs[key] = val;
    });
  });
  // Also scrape key-value spans near "Характеристики"
  $('[class*="harakter" i], [class*="характер" i]').find('*').each((_, el) => {
    const key = cleanText($(el).find('span, b, strong').first().text());
    let val = '';
    if (key) {
      val = cleanText($(el).clone().children().remove().end().text());
      if (key && val && key.length < 80) specs[key] = val;
    }
  });
  // CS-Cart specific: product features blocks
  $('[class*="product-feature" i]').each((_, el) => {
    const $el = $(el);
    const key = cleanText($el.find('[class*="name" i]').first().text());
    const val = cleanText($el.find('[class*="value" i]').first().text());
    if (key && val && key.length < 80) specs[key] = val;
  });
  // List-style features: li with two spans
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

function extractDescription($) {
  // Prefer the "Описание" tab content; fallback to any product description block
  let desc = '';
  const candidates = [
    '#content_description',
    '[id*="описан" i]',
    '.ty-wysiwyg-content',
    '.product-description',
  ];
  for (const sel of candidates) {
    const t = cleanText($(sel).text());
    if (t && t.length > 10) { desc = t; break; }
  }
  if (!desc) {
    // take any long paragraph near tabs
    $('p').each((_, p) => {
      const t = cleanText($(p).text());
      if (t.length > desc.length) desc = t;
    });
  }
  return splitSentences(desc);
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
  } catch (e) {
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

async function ensureImages(slug, imageUrls) {
  // Limit to a single image per product: only save the first URL as main.webp
  const dir = path.join(PUBLIC_DIR, 'products', slug);
  await fs.mkdir(dir, { recursive: true });
  const firstUrl = imageUrls && imageUrls.length ? imageUrls[0] : null;
  if (!firstUrl) return null;
  const outPath = path.join(dir, 'main.webp');
  const ok = await downloadWithRetries(firstUrl, outPath, 3);
  if (!ok) return null;
  try { await fs.access(outPath); return [outPath]; } catch { return null; }
}

async function ensureExistingImages(slug) {
  // Reuse existing local image but limit to a single file (prefer main.webp)
  const dir = path.join(PUBLIC_DIR, 'products', slug);
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const names = entries.filter(e => e.isFile() && /(\.webp)$/i.test(e.name)).map(e => e.name);
    if (names.length === 0) return null;
    const pick = names.includes('main.webp')
      ? 'main.webp'
      : (names.find(n => /^alt\d+\.webp$/i.test(n)) || names[0]);
    return [path.join(dir, pick)];
  } catch {
    return null;
  }
}

async function parseProduct(url) {
  const html = await fetchText(url);
  const $ = cheerioLoad(html);

  // title
  const h1 = cleanText($('h1').first().text());
  const title = h1 || cleanText($('title').text()).replace(/\s+\|.*/,'');
  const slug = normSlug(title);

  // price
  let priceText = '';
  $('[class*="price" i]').each((_, el) => {
    const t = cleanText($(el).text());
    if (/[₸]/.test(t) || /\d/.test(t)) {
      if (t.length > priceText.length) priceText = t;
    }
  });
  const price = parsePriceToNumber(priceText);

  // description
  const description = extractDescription($);

  // specs
  const specs = extractSpecs($);

  // images
  const imageUrls = extractGalleryImages($);

  return { url, title, slug, description, price, specs, imageUrls };
}

async function loadExistingProducts() {
  try {
    const raw = await fs.readFile(PRODUCTS_JSON, 'utf8');
    const data = JSON.parse(raw);
    const set = new Set();
    for (const it of data) if (it && it.slug) set.add(it.slug);
    return { data, set };
  } catch (e) {
    return { data: [], set: new Set() };
  }
}

async function saveProductsAtomic(allProducts) {
  const tmp = PRODUCTS_JSON + '.tmp';
  await fs.writeFile(tmp, JSON.stringify(allProducts, null, 2), 'utf8');
  // On Windows, rename can intermittently fail with EPERM if antivirus locks the file.
  // Add a short, resilient retry to reduce flakiness.
  let delay = 100;
  const maxAttempts = 20;
  for (let i = 0; i < maxAttempts; i++) {
    try {
      await fs.rename(tmp, PRODUCTS_JSON);
      return;
    } catch (e) {
      if (i === maxAttempts - 1) throw e;
      // Exponential backoff to dodge transient EPERM/EBUSY locks
      await sleep(delay);
      delay = Math.min(delay * 2, 2000);
    }
  }
}

// Internal unsafe append (no locking). Do not call concurrently.
async function appendProductsUnlocked(newOnes) {
  const { data, set } = await loadExistingProducts();
  let added = 0;
  for (const p of newOnes) {
    if (!set.has(p.slug)) { data.push(p); set.add(p.slug); added++; }
  }
  if (added > 0) await saveProductsAtomic(data);
  return added;
}

// Simple async mutex to serialize file writes across concurrent product tasks
let __appendQueue = Promise.resolve();
async function appendProducts(newOnes) {
  let result = 0;
  let err = null;
  __appendQueue = __appendQueue
    .then(async () => {
      result = await appendProductsUnlocked(newOnes);
    })
    .catch(e => {
      // Swallow into chain but remember to rethrow to the caller
      err = e;
    });
  await __appendQueue;
  if (err) throw err;
  return result;
}

async function* crawlCategoryStream(startUrl) {
  // Memory-friendly streaming crawl that yields product URLs as they are discovered
  const visitedCat = new Set();
  const visitedPages = new Set();
  const yielded = new Set();
  const queue = [startUrl];

  while (queue.length) {
    const catUrl = queue.shift();
    if (visitedCat.has(catUrl)) continue;
    visitedCat.add(catUrl);
    await sleep(FETCH_DELAY_MS);
    let html;
    try {
      html = await fetchText(catUrl);
    } catch (e) {
      console.error(`[stream] error ${catUrl} => ${e?.message || e}`);
      continue;
    }
    const $ = cheerioLoad(html);

    // Products on category page
    const links = extractListingProductLinks($, catUrl);
    for (const l of links) {
      if (!yielded.has(l)) {
        yielded.add(l);
        yield l;
        if (MAX_PRODUCTS > 0 && yielded.size >= MAX_PRODUCTS) return;
      }
    }

    // Paginate current category sequentially to limit memory
    const pager = extractPaginationUrls($, catUrl);
    for (const p of pager) {
      if (visitedPages.has(p)) continue;
      visitedPages.add(p);
      await sleep(FETCH_DELAY_MS);
      let htmlP;
      try {
        htmlP = await fetchText(p);
      } catch (e) {
        console.error(`[stream] error ${p} => ${e?.message || e}`);
        continue;
      }
      const $p = cheerioLoad(htmlP);
      const plinks = extractListingProductLinks($p, p);
      for (const l of plinks) {
        if (!yielded.has(l)) {
          yielded.add(l);
          yield l;
          if (MAX_PRODUCTS > 0 && yielded.size >= MAX_PRODUCTS) return;
        }
      }
    }

    // Enqueue subcategories under the same root
    const subs = extractSubcategoryLinks($, catUrl)
      .filter(u => u.includes('/catalog/') && !u.includes('/product/'))
      .filter(u => u !== catUrl);
    for (const s of subs) {
      if (!visitedCat.has(s)) queue.push(s);
    }
  }
}

async function main() {
  const started = new Date();
  let processed = 0, okDescriptions = 0, okImages = 0, okSpecs = 0, errors = 0, appended = 0;
  const validProducts = [];

  const startUrl = SUBCATEGORY_URL || START_URL;
  console.log(`[scrape] Start: ${startUrl}`);
  console.log(`[scrape] cwd=${process.cwd()} node=${process.version} max=${MAX_PRODUCTS || 'unlimited'} conc=${PRODUCT_CONCURRENCY}`);
  await fs.mkdir(LOG_DIR, { recursive: true });
  await fs.appendFile(RUN_LOG, `Start ${started.toISOString()} max=${MAX_PRODUCTS || 'unlimited'}\n`, 'utf8');
  let discovered = 0;
  await fs.appendFile(RUN_LOG, `Discovered URLs: streaming\n`, 'utf8');

  const limit = pLimit(PRODUCT_CONCURRENCY);
  const running = [];
  const FLUSH_BATCH = 200;

  const schedule = (url) => limit(async () => {
    try {
      processed++;
      if (processed % 25 === 0) console.log(`[scrape] ${processed}`);
      await sleep(FETCH_DELAY_MS);
      const prod = await parseProduct(url);
      // Validate
      const hasTitle = !!prod.title;
      const hasDesc = !!prod.description && prod.description.length > 10;
      const specsObj = prod.specs || {};
      const specPairs = Object.entries(specsObj).filter(([k, v]) => k && v);
      const hasSpecs2 = specPairs.length >= 2;
  const imgUrls = (prod.imageUrls || []).filter(Boolean);
      // Download images now (ensure real)
      let localImages = null;
      if (NO_DOWNLOAD) {
        localImages = await ensureExistingImages(prod.slug);
      } else if (imgUrls.length > 0) {
        localImages = await ensureImages(prod.slug, imgUrls);
      }
  const hasImages = Array.isArray(localImages) && localImages.length > 0;
      if (hasDesc) okDescriptions++;
      if (hasImages) okImages++;
      if (hasSpecs2) okSpecs++;
      const checks = [
        hasDesc ? '✓ description' : '✗ description',
        hasImages ? '✓ images' : '✗ images',
        hasSpecs2 ? '✓ specs' : '✗ specs',
      ].join(' ');
      let logLine = `[${processed}] ${prod.slug || 'no-slug'} — ${checks}`;
      // Additional per-product image count logging
      if (hasImages) {
        console.log(`[OK] ${prod.slug} — ${localImages.length} images saved`);
      } else {
        console.log(`[SKIP] ${prod.slug} — no images`);
      }
      if (hasTitle && hasDesc && hasSpecs2 && hasImages) {
        const productObj = {
          slug: prod.slug,
          title: prod.title,
          price: prod.price ?? null,
          description: prod.description,
          specs: Object.fromEntries(specPairs),
          // Only one image allowed
          images: localImages.slice(0, 1).map(p => {
            const relFromPublic = path.relative(PUBLIC_DIR, p).replace(/\\/g, '/');
            return '/' + relFromPublic;
          }),
          sourceUrl: prod.url,
        };

        if (APPEND_ONLY) {
          const added = await appendProducts([productObj]);
          appended += added;
          const status = added > 0 ? 'appended ✓' : 'duplicate';
          logLine += ` ${status}`;
          console.log(logLine);
          await fs.appendFile(RUN_LOG, logLine + '\n', 'utf8');
        } else {
          validProducts.push(productObj);
          console.log(logLine);
          await fs.appendFile(RUN_LOG, logLine + '\n', 'utf8');
        }
      } else {
        const reasons = [];
        if (!hasTitle) reasons.push('no-title');
        if (!hasDesc) reasons.push('no-description');
        if (!hasSpecs2) reasons.push('specs<2');
        if (!hasImages) reasons.push('no-images');
        logLine += ` (skipped: ${reasons.join(', ')})`;
        console.log(logLine);
        await fs.appendFile(RUN_LOG, logLine + '\n', 'utf8');
      }
    } catch (e) {
      errors++;
      // urls.length no longer available; keep compact error log
      const errCompact = `[${processed}] error ${url} => ${e?.message || e}`;
      console.error(errCompact);
      await fs.appendFile(RUN_LOG, errCompact + '\n', 'utf8');
        // Optional: also write to a dedicated errors log for review
        try { await fs.appendFile(path.join(LOG_DIR, 'scrape_errors.txt'), errCompact + '\n', 'utf8'); } catch {}
    }
  });

  for await (const url of crawlCategoryStream(startUrl)) {
    discovered++;
    const p = schedule(url);
    running.push(p);
    if (running.length >= FLUSH_BATCH) {
      await Promise.all(running.splice(0, running.length));
    }
  }
  if (running.length) await Promise.all(running);

  if (!APPEND_ONLY && validProducts.length > 0) {
    const added = await appendProducts(validProducts);
    appended = added;
  }

  const ended = new Date();
  const summary = [
  `Total discovered: ${discovered}`,
    `Total processed: ${processed}`,
    `Descriptions added: ${okDescriptions}`,
    `Images downloaded: ${okImages}`,
    `Specs parsed: ${okSpecs}`,
    `Errors: ${errors}`,
    `Appended to products.json: ${appended}`,
    `Started: ${started.toISOString()}`,
    `Finished: ${ended.toISOString()}`
  ].join('\n');

  const md = `\n\n## Complex-Bar scrape summary (${new Date().toISOString()})\n\n${summary}\n`;
  try {
    await fs.appendFile(SUMMARY_MD, md, 'utf8');
    await fs.appendFile(RUN_LOG, `${summary}\n`, 'utf8');
  } catch (e) {
    console.error('[scrape] summary write failed:', e?.message || e);
  }
  console.log(summary);
  console.log('Done');
}

if (import.meta.url === pathToFileURL(__filename).href) {
  main().catch(err => {
    console.error('[scrape] Fatal:', err?.message || err);
    process.exit(1);
  });
}
