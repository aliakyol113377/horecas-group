# Horecas Group

Next.js 14 + TypeScript + Tailwind storefront for HoReCa supplies with i18n routing, file-DB fallback, importer, catalog filters, and cart.

## Features
- App Router, light professional UI with Tailwind
- i18n via middleware and `[lng]` segment (no Next i18n routing)
- Catalog with search, category/subcategory/material filters, sort, pagination
- File-DB fallback: serves from `data/products.json` (and `data/categories.json` if present)
- Importer (crawl or sitemap) to populate products and optimize images
- Cart (localStorage), About, Contacts (map + form), SEO (robots, sitemap)
 - Product pages with gallery, specs, breadcrumbs, JSON-LD, and similar products
 - Dynamic metadata (generateMetadata) for catalog, product, and locale layout
 - Favicon/icon via `app/icon.svg`

## Quick start
1. Install deps

```
npm i
```

2. Dev server

```
npm run dev
```

Open http://localhost:3000/ru

## Import data (file mode)
Set environment (see `.env.example`). For local file DB:

```
# .env
IMPORT_MODE=file
USE_FILE_DB=true
IMPORT_STRATEGY=crawl
IMPORT_IGNORE_ROBOTS=true # local only
```

Run dry-run or full import:

```
npm run import:dry
npm run import:run
```

Outputs:
- `data/products.json`
- `data/categories.json`
- images under `public/imported`
- logs under `logs/`

Tip: The importer keeps all original images optimized to `.webp`. Update `next.config.mjs` `images.remotePatterns` if you permit additional domains.

## API
- `GET /api/products` — supports: `page`, `pageSize`, `sort`, `q`, `category`, `subcategory`, `material`, `priceMin`, `priceMax`, `inStock`
- `GET /api/facets` — returns categories, brands, materials, subcategoriesByCategory
- `POST /api/leads` — saves phone lead to DB; falls back to `logs/leads.json` if DB is unavailable

## Notes
- Production should use DB mode; file mode is for environments without persistent DB.
- Respect `robots.txt` when crawling; set `IMPORT_IGNORE_ROBOTS=false` in production.
- To change remote images allow-list, update `next.config.mjs` `images.remotePatterns`.

## Deploy to Vercel

1) Environment variables (Project Settings → Environment Variables)

- DATABASE_URL: Postgres connection string (e.g., Supabase)
- IMPORT_BASE_URL, IMPORT_SITEMAP_URL: supplier source
- IMPORT_MODE: `db` for production, `file` if you prefer read-only file DB
- FILE_DB_DIR: `data` (only if using file DB)
- NEXT_PUBLIC_DEFAULT_LOCALE: `ru`
- NEXT_PUBLIC_PHONE_DISPLAY: e.g. `+7 776 311 811 0`
- NEXT_PUBLIC_SITE_URL: your production URL
- USE_FILE_DB: `true` to force file DB in environments without DB

2) Build & output

- Build command: `npm run build`
- Output: Next.js (no static export)

3) First deploy checklist

- If using DB: run migrations and seed if needed (Prisma)
- If using file DB: upload `data/products.json`, `data/categories.json` (optional) to the repository and ensure `USE_FILE_DB=true`
- Verify `app/icon.svg` renders the favicon
- Open `/ru/catalog` and a product page to validate metadata and JSON-LD

## SEO

- `app/[lng]/layout.tsx` defines default localized metadata
- `app/[lng]/catalog/page.tsx` declares catalog metadata
- `app/[lng]/product/[slug]/page.tsx` builds product metadata from file-DB/DB and injects Product JSON-LD
- `app/robots.ts` and `app/sitemap.ts` are included

## Troubleshooting

- Build warns: "Can't reach database" during SSG
	- This is non-blocking when `USE_FILE_DB=true`; the app will render with file DB
- "Module not found" for aliased imports
	- Prefer relative paths when building in strict environments without TS path alias support
- Images not loading
	- Ensure imported images were written to `public/imported` and paths in `data/products.json` are correct
