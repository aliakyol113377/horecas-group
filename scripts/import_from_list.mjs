#!/usr/bin/env node
// Import specific product URLs from Complex-Bar into file DB (data/products.json)
// Usage: node -r dotenv/config scripts/import_from_list.mjs --file=data/import_urls.txt

import fs from 'fs/promises'
import fss from 'fs'
import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'
import process from 'process'
import { load as cheerioLoad } from 'cheerio'
import slugify from 'slugify'
import sharp from 'sharp'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const ROOT = path.resolve(__dirname, '..')
const DATA_DIR = path.join(ROOT, 'data')
const PUBLIC_DIR = path.join(ROOT, 'public')
const PRODUCTS_JSON = path.join(DATA_DIR, 'products.json')

const FILE_ARG = (() => {
  const a = process.argv.find(s => s.startsWith('--file='))
  return a ? a.slice('--file='.length) : path.join(DATA_DIR, 'import_urls.txt')
})()

function sleep(ms){ return new Promise(r=>setTimeout(r, ms)) }

async function fetchText(url, { timeout = 12000 } = {}) {
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), timeout)
  try {
    const resp = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': 'Mozilla/5.0' } })
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
    return await resp.text()
  } finally { clearTimeout(id) }
}

function cleanText(t){ return t?.replace(/\s+/g, ' ').replace(/\u00A0/g, ' ').trim() || '' }
function normSlug(title){ return slugify(title, { lower: true, strict: true, locale: 'ru' }).replace(/-+/g,'-') }
function parsePriceToNumber(txt){ if(!txt) return null; const m = txt.replace(/[\s\u00A0]/g,'').match(/(\d+[\d]*)/); return m? Number(m[1]): null }
function absoluteUrl(url, base = 'https://complex-bar.kz'){ if(!url) return null; if(url.startsWith('http')) return url; if(url.startsWith('//')) return 'https:'+url; if(url.startsWith('/')) return base+url; return new URL(url, base).toString() }

function extractGalleryImages($){
  const seen = new Set(); const out=[]
  const add = (u)=>{ if(!u) return; const abs = absoluteUrl(u); if(!abs) return; if(/placeholder|no-image|sprite|\.(svg)$/i.test(abs)) return; if(/(\/images\/logos\/|(^|\/)logo(\.|-|_|\/))/i.test(abs)) return; if(!seen.has(abs)){ seen.add(abs); out.push(abs) } }
  $('.product-gallery img, .swiper-wrapper img, .ty-product-img img, img').each((_,el)=>{
    const srcset = $(el).attr('srcset') || ''
    if (srcset) srcset.split(',').map(s=>s.trim().split(' ')[0]).forEach(add)
    add($(el).attr('data-large-src')); add($(el).attr('data-src')); add($(el).attr('src'))
  })
  return out
}

function extractSpecs($){ const specs={}; $('table, dl').each((_,c)=>{ const $c=$(c); $c.find('tr').each((__,tr)=>{ const t=$(tr).find('td,th'); if(t.length>=2){ const k=cleanText($(t[0]).text()); const v=cleanText($(t[1]).text()); if(k&&v&&k.length<80) specs[k]=v } }); $c.find('dt').each((__,dt)=>{ const k=cleanText($(dt).text()); const v=cleanText($(dt).next('dd').text()); if(k&&v&&k.length<80) specs[k]=v }) }); return specs }

function extractDescription($){ let d=''; const cands=['#content_description','[id*="описан" i]','.ty-wysiwyg-content','.product-description']; for(const sel of cands){ const t=cleanText($(sel).text()); if(t&&t.length>10){ d=t; break } } if(!d){ $('p').each((_,p)=>{ const t=cleanText($(p).text()); if(t.length>d.length) d=t }) } return d }

async function downloadToWebp(url, outPath){ const res = await fetch(url, { headers:{'User-Agent':'Mozilla/5.0'} }); if(!res.ok) return false; const buf=Buffer.from(await res.arrayBuffer()); const out=await sharp(buf,{failOnError:false}).resize({width:800, withoutEnlargement:true}).webp({quality:82}).toBuffer(); await fs.mkdir(path.dirname(outPath),{recursive:true}); await fs.writeFile(outPath,out); return true }
async function ensureImage(slug, imageUrls){ const dir=path.join(PUBLIC_DIR,'products',slug); await fs.mkdir(dir,{recursive:true}); const first=imageUrls && imageUrls[0]; if(!first) return null; const out=path.join(dir,'main.webp'); const ok = await downloadToWebp(first, out); return ok ? '/'+path.relative(path.join(ROOT,'public'), out).replace(/\\/g,'/') : null }

async function parseProduct(url){ const html=await fetchText(url); const $=cheerioLoad(html); const title=cleanText($('h1').first().text()) || cleanText($('title').text()).replace(/\s+\|.*/, ''); const slug=normSlug(title); let priceText=''; $('[class*="price" i]').each((_,el)=>{ const t=cleanText($(el).text()); if(/[₸]/.test(t)||/\d/.test(t)){ if(t.length>priceText.length) priceText=t } }); const price=parsePriceToNumber(priceText); const description=extractDescription($); const specs=extractSpecs($); const imageUrls=extractGalleryImages($); return { url, title, slug, description, price, specs, imageUrls } }

async function loadExisting(){ try{ const raw=await fs.readFile(PRODUCTS_JSON,'utf8'); const data=JSON.parse(raw); const set=new Set(data.map((x)=>x.slug)); return {data,set} } catch{ return {data:[], set:new Set()} }}
async function saveProducts(all){ await fs.writeFile(PRODUCTS_JSON+'.tmp', JSON.stringify(all, null, 2),'utf8'); await fs.rename(PRODUCTS_JSON+'.tmp', PRODUCTS_JSON) }

async function append(products){ const {data,set}=await loadExisting(); let added=0; for(const p of products){ if(!set.has(p.slug)){ data.push(p); set.add(p.slug); added++ } } if(added>0) await saveProducts(data); return added }

async function main(){
  const file = path.isAbsolute(FILE_ARG) ? FILE_ARG : path.join(process.cwd(), FILE_ARG)
  const text = fss.existsSync(file) ? fss.readFileSync(file,'utf8') : ''
  const urls = text.split(/\r?\n/).map(s=>s.trim()).filter(Boolean)
  if(urls.length===0){ console.log('No URLs found in', file); return }
  let added=0, processed=0
  for (const url of urls){
    try{
      processed++
      const p = await parseProduct(url)
      const img = await ensureImage(p.slug, p.imageUrls)
      if (!img) continue
      const product = { slug: p.slug, title: p.title, description: p.description, price: p.price ?? null, specs: p.specs, images: [img], sourceUrl: url }
      const inc = await append([product])
      added += inc
      console.log(`[OK] ${p.slug} ${inc? 'appended' : 'duplicate'}`)
    }catch(e){ console.error('[FAIL]', url, e?.message||e) }
    await sleep(150)
  }
  console.log('Processed:', processed, 'Added:', added)
}

if (import.meta.url === pathToFileURL(__filename).href){
  main().catch((e)=>{ console.error(e); process.exit(1) })
}
