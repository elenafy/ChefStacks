// src/app/api/diagnostics/route.ts
export const runtime = "nodejs";
import { NextResponse } from "next/server";

import { createYouTubeAPI } from "@/lib/youtubeDataApi";

function bool(v: any): boolean {
  return !!(typeof v === 'string' ? v.trim() : v);
}

function safeHas(name: string): boolean {
  try {
    return bool(process.env[name]);
  } catch {
    return false;
  }
}

export async function GET() {
  // Env presence (no secret values)
  const hasOpenAIKey = safeHas('OPENAI_API_KEY');
  const hasYouTubeKey = safeHas('YOUTUBE_API_KEY');
  const hasSupabaseUrl = safeHas('NEXT_PUBLIC_SUPABASE_URL');
  const hasSupabaseAnon = safeHas('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY');

  // YouTube API client availability
  let youtubeApiConfigured = false;
  try {
    const yt = createYouTubeAPI();
    youtubeApiConfigured = !!yt;
  } catch {
    youtubeApiConfigured = false;
  }

  // Attempt to import @sparticuz/chromium (serverless chrome)
  let canImportChromium = false;
  try {
    // Use eval to avoid build-time resolution issues
    // eslint-disable-next-line no-eval
    const mod = await eval('import("@sparticuz/chromium")');
    canImportChromium = !!mod;
  } catch {
    canImportChromium = false;
  }

  // Check for common system Chrome paths (serverless images sometimes include one)
  let hasSystemChrome = false;
  try {
    const fs = await import('fs');
    const candidates = [
      '/usr/bin/chromium-browser',
      '/usr/bin/chromium',
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/opt/google/chrome/chrome'
    ];
    hasSystemChrome = candidates.some(p => {
      try { return fs.existsSync(p); } catch { return false; }
    });
  } catch {
    hasSystemChrome = false;
  }

  // Basic runtime info
  const runtimeInfo = {
    node: process.version,
    vercel: bool(process.env.VERCEL),
    awsRegion: process.env.AWS_REGION || null,
    googleProject: process.env.GOOGLE_CLOUD_PROJECT || null,
    platform: process.platform,
    arch: process.arch,
  };

  return NextResponse.json({
    env: {
      OPENAI_API_KEY: hasOpenAIKey,
      YOUTUBE_API_KEY: hasYouTubeKey,
      NEXT_PUBLIC_SUPABASE_URL: hasSupabaseUrl,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: hasSupabaseAnon,
    },
    youtubeApiConfigured,
    chromium: {
      canImportChromium,
      hasSystemChrome,
    },
    runtime: runtimeInfo,
  });
}


