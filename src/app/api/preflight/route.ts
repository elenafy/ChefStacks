import { NextRequest, NextResponse } from "next/server";
import { preflightChecker } from "@/lib/preflightChecker";

export async function POST(req: NextRequest) {
  try {
    const { url, allowOverride } = await req.json();
    
    if (!url) {
      return NextResponse.json({ error: "URL is required" }, { status: 400 });
    }

    console.log('🔍 Running preflight check for:', url);
    const startTime = Date.now();
    
    const result = await preflightChecker.checkVideo(url);
    
    const duration = Date.now() - startTime;
    console.log(`⏱️ Preflight check completed in ${duration}ms`);
    console.log(`📊 Result: ${result.pass ? 'PASS' : 'FAIL'} (score: ${result.score}, borderline: ${result.borderline})`);

    // If failed but user wants to override, allow it
    if (!result.pass && allowOverride && result.allowOverride) {
      return NextResponse.json({
        success: true,
        pass: true,
        overridden: true,
        originalResult: result,
        message: "Preflight failed but override allowed"
      });
    }

    return NextResponse.json({
      success: true,
      pass: result.pass,
      score: result.score,
      reason: result.reason,
      borderline: result.borderline,
      allowOverride: result.allowOverride,
      checks: result.checks,
      tinyClassifier: result.tinyClassifier,
      duration: duration
    });

  } catch (error) {
    console.error('❌ Preflight check failed:', error);
    return NextResponse.json({ 
      success: false,
      error: "Preflight check failed", 
      details: error instanceof Error ? error.message : "Unknown error"
    }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    message: "Preflight checker API",
    endpoints: {
      POST: "Check if a YouTube video is likely to contain a recipe"
    },
    usage: {
      method: "POST",
      body: {
        url: "YouTube URL to check",
        allowOverride: "Optional: allow override if preflight fails (boolean)"
      }
    }
  });
}
