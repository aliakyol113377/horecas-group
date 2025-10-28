import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const info = {
    time: new Date().toISOString(),
    vercelEnv: process.env.VERCEL_ENV || null,
    commitSha: process.env.VERCEL_GIT_COMMIT_SHA || null,
    commitMessage: process.env.VERCEL_GIT_COMMIT_MESSAGE || null,
    buildId: process.env.VERCEL_BUILD_OUTPUT_ID || null,
    siteUrl: process.env.NEXT_PUBLIC_SITE_URL || null,
  }
  return NextResponse.json(info, { headers: { 'Cache-Control': 'no-store' } })
}
